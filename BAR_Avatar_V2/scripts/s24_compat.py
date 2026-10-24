"""Step 24 - measured compatibility: mesh interpenetration between pieces (and against the visible skin)
in the rest pose and in animated frames. Writes source/cache/compat_measurements.json; the manifests turn
the counts into ok / minor_clipping / blocked.

Metric: number of intersecting triangle pairs (BVHTree.overlap) between the two deformed meshes; for skin
checks only the body regions that stay visible with the piece are used.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

REGIONS = json.load(open(os.path.join(CACHE, "body_regions.json"), encoding="utf-8"))["regions"]
FRAMES = [("rest", None, 0), ("Walk", "Walk", 7), ("Sit", "Sit", 60), ("Dance", "Dance", 200), ("Drink", "Drink", 120),
          ("Wave", "Wave", 20)]
THRESH = {"ok": 10, "minor": 60}  # standing poses: <= ok: ok ; <= minor: minor_clipping ; else blocked
# Seated lap clipping (hem sinking into the thighs) is a linear-skinning limit without cloth simulation:
# reported separately and not used for the status (table and chair hide most of it in game).
SEATED = ("Sit",)
BY_DESIGN_SKIN = {"footwear_flipflops": "the planted sole of the foot sits into the flip-flop sole (hidden)"}


def pieces(body):
    out = {}
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.endswith(f"__{body}"):
            pid = o.name[: -len(body) - 2]
            if pid.split("_")[0] in ("hair", "facial", "top", "bottom", "footwear", "accessory"):
                out[pid] = o
    return out


def evaluated_tris(ob, keep_faces=None):
    """Deformed triangles; hem fold faces (attribute bar_hem) are interior surfaces and are skipped."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    V = [tuple(ob.matrix_world @ v.co) for v in me.vertices]
    if keep_faces is None and "bar_hem" in me.attributes:
        keep_faces = 1 - int_array(me.attributes["bar_hem"].data, "value")
    me.calc_loop_triangles()
    T = [tuple(t.vertices) for t in me.loop_triangles if keep_faces is None or keep_faces[t.polygon_index]]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(V, T, all_triangles=True) if T else None


def visible_skin_mask(body_ob, hides):
    reg = int_array(body_ob.data.attributes["body_region"].data, "value")
    hid = {REGIONS.index(h) for h in hides}
    # head stays visible but its intersections with hair/hats are expected (scalp under hair): skip head region
    hid.add(REGIONS.index("head"))
    return np.array([r not in hid for r in reg])


PAIRS = [("top", "bottom"), ("hair", "accessory"), ("hair", "top"), ("facial", "top"), ("footwear", "bottom"),
         ("facial", "accessory"), ("hair", "facial"), ("accessory", "top"), ("accessory", "accessory")]


def measure(body):
    rig = bpy.data.objects[f"RIG_{body}"]
    body_ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    P = pieces(body)
    res = {"pairs": {}, "skin": {}, "skin_with_top": {}}
    rig.animation_data_create()
    for tag, clip, frame in FRAMES:
        rig.animation_data.action = bpy.data.actions[f"{clip}__{body}"] if clip else None
        if not clip:
            for pb in rig.pose.bones:
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.location = (0, 0, 0)
        bpy.context.scene.frame_set(frame)
        bvh = {pid: evaluated_tris(o) for pid, o in P.items()}
        for a_cat, b_cat in PAIRS:
            for a, ta in bvh.items():
                if a.split("_")[0] != a_cat or ta is None:
                    continue
                for b, tb in bvh.items():
                    if b.split("_")[0] != b_cat or tb is None or a == b or (a_cat == b_cat and a > b):
                        continue
                    n = len(ta.overlap(tb))
                    key = f"{a}|{b}"
                    res["pairs"].setdefault(key, {})[tag] = n
        for pid, o in P.items():
            hides = [h for h in o.get("bar_hides", "").split(",") if h]
            skin = evaluated_tris(body_ob, visible_skin_mask(body_ob, hides))
            if bvh[pid] is not None and skin is not None:
                res["skin"].setdefault(pid, {})[tag] = len(bvh[pid].overlap(skin))
            if pid.startswith("bottom_") and bvh[pid] is not None:
                # worn with any top the 'waist' band is hidden too (s08 / rig-contract regionRules)
                skin2 = evaluated_tris(body_ob, visible_skin_mask(body_ob, hides + ["waist"]))
                res["skin_with_top"].setdefault(pid, {})[tag] = len(bvh[pid].overlap(skin2))
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    return res


def classify(counts):
    standing = [v for k, v in counts.items() if k not in SEATED]
    worst = max(standing) if standing else 0
    return ("ok" if worst <= THRESH["ok"] else "minor_clipping" if worst <= THRESH["minor"] else "blocked"), worst


def entry(v, by_design=None):
    status, worst = classify(v)
    e = {"status": "by_design" if by_design else status, "worst_standing": worst,
         "seated": max([v[k] for k in SEATED if k in v] or [0]), "per_pose": v}
    if by_design:
        e["note"] = by_design
    return e


def run():
    out = {}
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        loc = rig.location.copy()
        rig.location = (0, 0, 0)
        m = measure(body)
        rig.location = loc
        out[body] = {"pairs": {k: entry(v) for k, v in m["pairs"].items()},
                     "skin": {k: entry(v, BY_DESIGN_SKIN.get(k)) for k, v in m["skin"].items()},
                     "skin_with_top": {k: entry(v) for k, v in m["skin_with_top"].items()}}
    save_json(os.path.join(CACHE, "compat_measurements.json"), {"metric": "intersecting triangle pairs (BVHTree.overlap)",
                                                                "thresholds": THRESH, "poses": [f[0] for f in FRAMES], "bodies": out})
    for body, d in out.items():
        bad = {k: (v["status"], v["worst_standing"]) for k, v in d["pairs"].items() if v["status"] != "ok"}
        skin = {k: (v["status"], v["worst_standing"]) for k, v in d["skin"].items() if v["status"] != "ok"}
        print(body, "pairs not ok:", len(bad), "of", len(d["pairs"]))
        print("  ", sorted(bad.items(), key=lambda kv: -kv[1][1])[:30])
        print("   skin not ok:", sorted(skin.items(), key=lambda kv: -kv[1][1]))
    return out


COMPAT = run()
