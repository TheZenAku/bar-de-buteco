"""Step 08 - body coverage regions (per face) on the shared body topology.

Each body face gets a region id (face attribute 'body_region'); the id is also written to a second UV map
'UVRegion' as u = (id + 0.5) / 32, v = 0.5 so it survives glTF export as TEXCOORD_1. Garments list the regions
they fully cover; the game hides those regions (bitmask) instead of deleting body triangles.
Landmarks come from the neutral shape; topology is shared, so the classification is valid for every body.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s04_rig.py", encoding="utf-8").read().split("RIGS = {}")[0])

REGIONS = ["head", "neck", "chest", "shoulder_l", "shoulder_r", "torso_lower", "pelvis"]
for _s in ("l", "r"):
    REGIONS += [f"{p}_{_s}" for p in ("upperarm_a", "upperarm_b", "lowerarm_a", "lowerarm_b", "hand",
                                      "thigh_a", "thigh_b", "shin_a", "shin_b", "foot")]
# 'waist' (appended: earlier ids stay stable) = pelvis faces reaching above waist - WAIST_BAND. On the decimated
# body those faces straddle both the tops' hem and the bottoms' waistband, so neither garment covers them alone:
# the game hides 'waist' only when a TOP and a BOTTOM are worn together (their union covers it). Garment
# construction keeps treating them as pelvis (garment_lib.body_data).
REGIONS.append("waist")
WAIST_BAND = 0.02
REGION_ID = {n: i for i, n in enumerate(REGIONS)}
assert len(REGIONS) <= 32


def landmarks(V):
    j = compute_joints(V)
    p = lambda b, e="head": np.array(jp(j, b, e))
    L = {
        "neck_top": p("spine.006")[2] - 0.035,          # under the jaw / skull base
        "collar": p("spine.004")[2] + 0.005,            # neck base
        "chest_low": p("spine.003")[2] - 0.035,         # just under the chest
        "waist": p("spine")[2] + 0.085,                 # waistband line (iliac crest)
        "shoulder_x": abs(p("upper_arm.L")[0]),         # glenohumeral joint
        "elbow_x": abs(p("forearm.L")[0]),
        "wrist_x": abs(p("hand.L")[0]),
        "shoulder_split": abs(p("shoulder.L")[0]) + 0.07,
        "hip_z": p("thigh.L")[2],
        "crotch": p("thigh.L")[2] - 0.08,
        "knee_z": p("shin.L")[2],
        "ankle_z": p("foot.L")[2],
    }
    L["ua_mid"] = L["shoulder_x"] + 0.5 * (L["elbow_x"] - L["shoulder_x"])
    L["la_mid"] = L["elbow_x"] + 0.5 * (L["wrist_x"] - L["elbow_x"])
    L["thigh_mid"] = L["crotch"] - 0.42 * (L["crotch"] - L["knee_z"])
    L["shin_mid"] = L["knee_z"] - 0.5 * (L["knee_z"] - L["ankle_z"])
    L["foot_top"] = L["ankle_z"] + 0.025
    return {k: float(v) for k, v in L.items()}


ARM_BONES = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")


def classify(c, L, dominant):
    x, y, z = c
    ax = abs(x)
    s = "l" if x >= 0 else "r"
    is_arm = dominant.split("_")[0] in ARM_BONES
    if is_arm and ax > L["shoulder_x"] - 0.02:  # arms (T-pose: along X); torso sides stay torso
        if ax > L["wrist_x"] + 0.005:
            return f"hand_{s}"
        if ax > L["la_mid"]:
            return f"lowerarm_b_{s}"
        if ax > L["elbow_x"]:
            return f"lowerarm_a_{s}"
        if ax > L["ua_mid"]:
            return f"upperarm_b_{s}"
        return f"upperarm_a_{s}"
    if ax > L["wrist_x"]:
        return f"hand_{s}"
    if z > L["neck_top"]:
        return "head"
    if z > L["collar"]:
        return "neck"
    if z > L["chest_low"]:
        return f"shoulder_{s}" if ax > L["shoulder_split"] else "chest"
    if z > L["waist"]:
        return "torso_lower"
    # pelvis / legs: below the waist the leg starts under the leg line that rises to the hip side
    leg_line = L["crotch"] + 0.55 * max(0.0, ax - 0.02)
    if z > min(leg_line, L["hip_z"] - 0.01):
        return "pelvis"
    if z < L["foot_top"]:
        return f"foot_{s}"
    if z < L["shin_mid"]:
        return f"shin_b_{s}"
    if z < L["knee_z"]:
        return f"shin_a_{s}"
    if z < L["thigh_mid"]:
        return f"thigh_b_{s}"
    return f"thigh_a_{s}"


def assign_regions(ob, V_neutral):
    L = landmarks(V_neutral)
    lp = bpy.data.objects["LP_TOPO"]
    Vl = mesh_arrays(lp.data)  # neutral-shape low poly positions (same topology as the bodies)
    # dominant deforming bone per face from the body's canonical weights (identical for every body)
    names = [g.name for g in ob.vertex_groups]
    W = np.zeros((len(ob.data.vertices), len(names)))
    for v in ob.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    ids = []
    for p in lp.data.polygons:
        vs = list(p.vertices)
        c = Vl[vs].mean(0)
        dominant = names[int(W[vs].sum(0).argmax())]
        r = classify(c, L, dominant)
        if r == "pelvis" and Vl[vs][:, 2].max() > L["waist"] - WAIST_BAND:
            r = "waist"
        ids.append(REGION_ID[r])
    ids = np.array(ids, dtype=np.int32)
    me = ob.data
    if "body_region" not in me.attributes:
        me.attributes.new("body_region", "INT", "FACE")
    me.attributes["body_region"].data.foreach_set("value", ids)
    uvr = me.uv_layers.get("UVRegion") or me.uv_layers.new(name="UVRegion")
    loop_reg = np.repeat(ids, [p.loop_total for p in me.polygons])
    uv = np.stack([(loop_reg + 0.5) / 32.0, np.full(len(loop_reg), 0.5)], 1)
    uvr.data.foreach_set("uv", uv.ravel())
    me.uv_layers.active = me.uv_layers["UVAtlas"]
    me.uv_layers["UVAtlas"].active_render = True
    return ids, L


V_NEUTRAL = np.load(os.path.join(CACHE, "neutral.npy"))
for body in ("female", "male"):
    IDS, LANDMARKS = assign_regions(bpy.data.objects[f"BAR_Body_{body.capitalize()}"], V_NEUTRAL)
save_json(os.path.join(CACHE, "body_regions.json"), {"regions": REGIONS, "landmarks_neutral": LANDMARKS,
                                                     "face_region": IDS.tolist()})
print({r: int((IDS == i).sum()) for i, r in enumerate(REGIONS)})
