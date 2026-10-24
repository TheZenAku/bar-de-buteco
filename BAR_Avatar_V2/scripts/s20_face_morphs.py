"""Step 20 - facial morph targets (glTF morph targets / Blender shape keys) and face presets.

Targets come from CharMorph Antonia morphs, evaluated on the high resolution mesh, transferred to the low
poly topology through the same barycentric binding as the bodies, and masked to the face (scalp, ears and
neck keep their shape so hair, hats and collars still fit). The same targets are transferred to the brows
and facial-hair pieces so they follow the face. Presets are weight combinations (no extra geometry).
"""
import sys
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s01_build_shapes.py", encoding="utf-8").read().split("def build():")[0])
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s04_rig.py", encoding="utf-8").read().split("RIGS = {}")[0])

TARGETS = {  # values beyond 1.0 are intentional (stylised, readable at game distance)
    "face_jaw_wide": {"Jaw wide lower": 1.7, "Chin wide": 1.0},
    "face_jaw_narrow": {"Face thin": 1.4, "Chin short": 0.5},
    "face_nose_big": {"Nose even bigger": 1.4, "Nose wide": 0.7},
    "face_nose_small": {"Nose small": 1.5, "Nose tip up": 0.6},
    "face_cheeks_full": {"Chubby head only": 1.4},
    "face_cheekbones": {"Cheek bones 1": 1.7},
    "face_brow_heavy": {"Supraorbital define": 1.6, "Neanderthal head only": 0.5},
    "face_lips_full": {"Lips full top": 1.1, "Lips full bottom": 1.1},
}
PRESETS = {
    "male": {"default": {}, "classico": {"face_jaw_wide": 0.6, "face_nose_big": 0.5, "face_brow_heavy": 0.5},
             "magro": {"face_jaw_narrow": 0.7, "face_cheekbones": 0.6, "face_nose_small": 0.2},
             "bochechudo": {"face_cheeks_full": 0.9, "face_nose_big": 0.3, "face_jaw_wide": 0.2},
             "serio": {"face_brow_heavy": 0.9, "face_cheekbones": 0.5, "face_jaw_wide": 0.4}},
    "female": {"default": {}, "suave": {"face_lips_full": 0.6, "face_nose_small": 0.5},
               "marcante": {"face_cheekbones": 0.8, "face_jaw_narrow": 0.4},
               "redonda": {"face_cheeks_full": 0.8, "face_nose_small": 0.3},
               "forte": {"face_jaw_wide": 0.5, "face_nose_big": 0.4, "face_brow_heavy": 0.4}},
}
FACE_PARTS = ["BAR_Brows_regular", "BAR_Brows_thin", "BAR_Brows_thick", "facial_beard_short", "facial_beard_full",
              "facial_goatee", "facial_mustache"]


def raw_shape(body, extra):
    vals = dict(MORPHS[body])
    for k, v in extra.items():
        vals[k] = vals.get(k, 0.0) + v
    return morphed(vals)


def face_mask(V, joints):
    """1 on the face (in front of the ears, below the hairline, above the neck), smooth falloff."""
    p = lambda b, e="head": np.array(jp(joints, b, e))
    ear_y = p("ear.L")[1] - 0.015
    brow_top = p("eye.L")[2] + 0.05
    chin = p("chin")[2] - 0.03
    m = smoothstep(ear_y + 0.02, ear_y - 0.015, V[:, 1])
    m *= smoothstep(brow_top + 0.025, brow_top, V[:, 2])
    m *= smoothstep(chin - 0.02, chin + 0.01, V[:, 2])
    m *= smoothstep(0.11, 0.08, np.abs(V[:, 0]))
    return m


def build_targets(body):
    final = np.load(os.path.join(CACHE, f"{body}.npy"))
    base_raw = raw_shape(body, {})
    # s01 scaled every shape to its body height after sculpting: reuse that ratio on the deltas
    scale = (final[:, 2].max() - final[:, 2].min()) / (base_raw[:, 2].max() - base_raw[:, 2].min())
    ids_bary = np.load(os.path.join(CACHE, "lp_binding.npz"))
    ids, bary, off = ids_bary["ids"], ids_bary["bary"], ids_bary["off"]
    exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s05_body.py", encoding="utf-8").read().split("LP = bpy.data")[0], globals())
    lp_base = rebuild(final, ids, bary, off)
    joints = compute_joints(final)
    mask = face_mask(lp_base, joints)
    deltas = {}
    for name, morphs in TARGETS.items():
        hp = final + (raw_shape(body, morphs) - base_raw) * scale
        d = (rebuild(hp, ids, bary, off) - lp_base) * mask[:, None]
        deltas[name] = d
        print(body, name, "max delta mm", round(float(np.linalg.norm(d, axis=1).max()) * 1000, 2))
    np.savez(os.path.join(CACHE, f"face_targets_{body}.npz"), **deltas)
    return lp_base, deltas


def set_shape_keys(ob, deltas):
    me = ob.data
    if me.shape_keys:
        ob.shape_key_clear()
    basis = ob.shape_key_add(name="Basis", from_mix=False)
    co = mesh_arrays(me)
    for name, d in deltas.items():
        k = ob.shape_key_add(name=name, from_mix=False)
        k.data.foreach_set("co", (co + d).ravel())
        k.value = 0.0
        k.slider_min, k.slider_max = 0.0, 1.0


def transfer_to_part(part, body_ob, lp_base, deltas):
    """Each part vertex takes the delta of the nearest point on the body surface."""
    bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in lp_base], [tuple(p.vertices) for p in body_ob.data.polygons])
    P = mesh_arrays(part.data)
    tri_ids, weights = [], []
    polys = [list(p.vertices) for p in body_ob.data.polygons]
    for p in P:
        loc, nrm, fi, dist = bvh.find_nearest(Vector(p))
        vs = polys[fi]
        w = np.array([1.0 / max((Vector(lp_base[v]) - loc).length, 1e-5) for v in vs])
        tri_ids.append(vs)
        weights.append(w / w.sum())
    out = {}
    for name, d in deltas.items():
        out[name] = np.array([(d[vs] * w[:, None]).sum(0) for vs, w in zip(tri_ids, weights)])
    set_shape_keys(part, out)


def run():
    report = {}
    for body in ("male", "female"):
        lp_base, deltas = build_targets(body)
        body_ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
        assert np.abs(mesh_arrays(body_ob.data) - lp_base).max() < 1e-5, "body mesh differs from the binding"
        set_shape_keys(body_ob, deltas)
        for part in FACE_PARTS:
            ob = bpy.data.objects.get(f"{part}__{body}")
            if ob:
                transfer_to_part(ob, body_ob, lp_base, deltas)
        body_ob["bar_face_presets"] = json.dumps(PRESETS[body])
        report[body] = {k: float(np.linalg.norm(v, axis=1).max()) for k, v in deltas.items()}
    save_json(os.path.join(CACHE, "face_presets.json"), {"targets": list(TARGETS), "presets": PRESETS, "max_delta_m": report})
    return report


REPORT = run()
