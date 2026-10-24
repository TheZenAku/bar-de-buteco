"""Step 01 - high resolution body shapes from CharMorph Antonia (same topology for every body).

Outputs (source/cache): neutral.npy, female.npy, male.npy  (36030 x 3, Antonia vertex order)
Requires the CharMorph object 'cm_antonia' in the current file (import via CharMorph first).
"""
import sys
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

HEIGHTS = {"neutral": 1.72, "female": 1.67, "male": 1.78}

MORPHS = {
    "neutral": {"Genital gone": 1.0, "Nipples gone": 1.0},
    "female": {"Genital gone": 1.0, "Nipples gone": 1.0, "Breast small": 0.25, "Athletic body only": 0.2,
               "Lips full top": 0.2, "Eyes big": 0.15},
    "male": {"Genital gone": 1.0, "Nipples gone": 1.0, "Breast small": 1.0, "Athletic body only": 0.75,
             "Hip narrow": 1.0, "Glute tighter": 0.6, "Jaw wide lower": 0.75, "Chin wide": 0.6,
             "Supraorbital define": 0.8, "Eyebrows strong": 0.5, "Neanderthal head only": 0.22,
             "Lips small Y": 0.45, "Face wide": 0.25, "Nose even bigger": 0.25, "Neck scale X": 0.8,
             "Neck scale Z": 0.5, "Chest trapeze": 0.6, "Cheek bones 1": 0.3, "Thigh full": 0.0},
}

HIER = json.load(open(os.path.join(CACHE, "antonia_metarig_hierarchy.json"), encoding="utf-8"))
FOREARM_CHAIN = ("forearm", "hand", "palm", "f_", "thumb")


def morphed(values):
    man = sys.modules["CharMorph.morphing"].manager
    ant = bpy.data.objects["cm_antonia"]
    man.update_morpher(sys.modules["CharMorph.morphing"].morpher.get(ant))
    m = man.morpher
    m.core.clamp = False
    for k, v in values.items():
        m.prop_set(k, v)
    V = mesh_arrays(ant.data)
    for k in values:
        m.prop_set(k, 0.0)
    return V


def joint_pos(joints, bone, end):
    """Head of a connected bone is its parent's tail (CharMorph stores only the free joints)."""
    key = f"{bone}_{end}"
    if key in joints:
        return np.asarray(joints[key])
    # CharMorph's "connected" option is not the same as use_connect: a missing head is the parent's tail.
    parent = HIER[bone][0]
    if end == "head" and parent:
        return joint_pos(joints, parent, "tail")
    raise KeyError(key)


def def_weight_matrix(n_verts):
    W = load_def_weights()
    names = sorted(W)
    M = np.zeros((n_verts, len(names)))
    for j, n in enumerate(names):
        idx, w = W[n]
        M[idx, j] = w
    s = M.sum(1, keepdims=True)
    M = np.divide(M, s, out=np.zeros_like(M), where=s > 1e-9)
    return names, M


def straighten_forearms(V, names, M):
    """Rotate each forearm chain about the elbow so it continues the upper-arm line (clean T-pose)."""
    joints = compute_joints(V)
    out = V.copy()
    for side in ("L", "R"):
        sh = joint_pos(joints, f"upper_arm.{side}", "head")
        el = joint_pos(joints, f"forearm.{side}", "head")
        wr = joint_pos(joints, f"forearm.{side}", "tail")
        target = Vector((1.0 if side == "L" else -1.0, 0.0, 0.0))  # arms exactly along +/-X
        cols = [j for j, n in enumerate(names) if n.endswith("." + side) or n.split(".")[-2:-1] == [side]]
        chain = [j for j in cols if names[j][4:].startswith(FOREARM_CHAIN)]
        ua = [j for j in cols if names[j][4:].startswith("upper_arm")]
        w_chain = M[:, chain].sum(1)
        w_arm = np.clip(M[:, ua].sum(1) + w_chain, 0, 1)
        # 1) whole arm about the shoulder: upper arm level along X
        R2 = np.array(Vector(el - sh).normalized().rotation_difference(target).to_matrix())
        out = out + (((out - sh) @ R2.T + sh) - out) * w_arm[:, None]
        el2 = (el - sh) @ R2.T + sh
        wr2 = (wr - sh) @ R2.T + sh
        # 2) forearm chain about the elbow: continue the upper-arm line
        R = np.array(Vector(wr2 - el2).normalized().rotation_difference(target).to_matrix())
        out = out + (((out - el2) @ R.T + el2) - out) * w_chain[:, None]
    return out


def masculinize(V, E):
    j = compute_joints(V)
    P = V.copy()
    z = P[:, 2]
    ax = np.abs(P[:, 0])
    chest_z = joint_pos(j, "breast.L", "head")[2]
    shoulder_z = joint_pos(j, "upper_arm.L", "head")[2]
    hip_z = joint_pos(j, "thigh.L", "head")[2]
    waist_z = joint_pos(j, "spine.001", "head")[2]
    # 1) flatten what remains of the breasts into a pectoral plane
    for side in (1, -1):
        c = joint_pos(j, "breast.L", "head") * np.array([side, 1, 1])
        d = np.linalg.norm((P - c) * np.array([1.0, 0.6, 1.1]), axis=1)
        front = smoothstep(0.02, -0.06, P[:, 1] - c[1])
        mask = smoothstep(0.15, 0.05, d) * front
        P = laplacian_smooth(P, E, mask, iterations=60, factor=0.6)
    # 2) broader shoulders and lats: translate arms outwards, taper back to the waist
    up = smoothstep(waist_z + 0.05, shoulder_z - 0.02, z)
    outward = smoothstep(0.04, 0.17, ax)
    P[:, 0] += np.sign(P[:, 0]) * 0.035 * up * outward
    # 3) thicker waist (less hourglass), narrower pelvis/hips and thighs
    band = smoothstep(hip_z - 0.02, waist_z, z) * smoothstep(chest_z, waist_z + 0.04, z)
    P[:, 0] *= 1.0 + 0.06 * band * (z > hip_z)
    hips = smoothstep(hip_z - 0.22, hip_z - 0.05, z) * smoothstep(waist_z + 0.02, hip_z, z)
    for side in ("L", "R"):
        a = joint_pos(j, f"thigh.{side}", "head"); b = joint_pos(j, f"thigh.{side}", "tail")
        sel = (np.sign(P[:, 0]) == (1 if side == "L" else -1)).astype(float)
        P = radial_scale(P, a, b, 0.88, hips * sel * smoothstep(0.03, 0.10, ax))
    # flatter glutes (male pelvis has less posterior volume)
    back = smoothstep(0.04, 0.12, P[:, 1]) * hips
    P[:, 1] -= (P[:, 1] - 0.04) * 0.25 * back
    arm_zone = smoothstep(shoulder_z - 0.25, shoulder_z - 0.15, z)
    # 4) neck and limbs a little thicker
    P = radial_scale(P, joint_pos(j, "spine.004", "head"), joint_pos(j, "spine.006", "head"), 1.12,
                     smoothstep(shoulder_z - 0.02, shoulder_z + 0.05, z) * smoothstep(1.60, 1.53, z) * (ax < 0.08))
    for side in ("L", "R"):
        s = 1 if side == "L" else -1
        sel = (np.sign(P[:, 0]) == s).astype(float)
        a = joint_pos(j, f"upper_arm.{side}", "head"); b = joint_pos(j, f"forearm.{side}", "head")
        w_arm = sel * arm_zone * smoothstep(abs(a[0]) + 0.02, abs(a[0]) + 0.06, ax)
        P = radial_scale(P, a, b, 1.12, w_arm * smoothstep(abs(b[0]) + 0.03, abs(b[0]) - 0.02, ax))
        c = joint_pos(j, f"forearm.{side}", "tail")
        P = radial_scale(P, b, c, 1.10, w_arm * smoothstep(abs(b[0]) - 0.04, abs(b[0]) + 0.02, ax)
                         * smoothstep(abs(c[0]) + 0.01, abs(c[0]) - 0.02, ax))
        # bigger hands and feet, scaled about wrist/ankle
        wrist = c
        hw = sel * arm_zone * smoothstep(abs(wrist[0]) - 0.01, abs(wrist[0]) + 0.01, ax)
        P = P + (P - wrist) * (0.08 * hw)[:, None]
        ankle = joint_pos(j, f"foot.{side}", "head")
        fw = sel * smoothstep(ankle[2] + 0.03, ankle[2] - 0.01, z)
        P = P + (P - ankle * np.array([1, 1, 0])) * (0.06 * fw)[:, None]
    return P


def scale_to_height(V, h):
    return V * (h / (V[:, 2].max() - min(0.0, V[:, 2].min())))


def build():
    ant = bpy.data.objects["cm_antonia"]
    E = edges_array(ant.data)
    names, M = def_weight_matrix(len(ant.data.vertices))
    shapes = {}
    for key in ("neutral", "female", "male"):
        V = morphed(MORPHS[key])
        if key == "male":
            V = masculinize(V, E)
        V = straighten_forearms(V, names, M)
        V[:, 2] -= V[:, 2].min()
        V = scale_to_height(V, HEIGHTS[key])
        shapes[key] = V
        np.save(os.path.join(CACHE, f"{key}.npy"), V)
        print(key, "height", round(V[:, 2].max(), 3), "width", round(np.ptp(V[:, 0]), 3))
    return shapes


if __name__ == "__main__" or True:
    SHAPES = build()
