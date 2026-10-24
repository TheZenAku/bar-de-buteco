"""Step 09 - shell-based modular pieces (both bodies): top_tee, bottom_jeans, hair_short.

Spec fields
  hides   : body regions fully covered (hidden in game while the piece is worn)
  select  : faces that generate the shell (generous, final edges come from `cuts`)
  offset  : distance from the skin per vertex; loosen: silhouette shaping (drape, straight legs ...)
  cuts    : planes for straight hems; shapers: boundary loops reshaped (crew neck)
Output objects: <piece_id>__<body>, parented to RIG_<body> with an Armature modifier.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\garment_lib.py", encoding="utf-8").read())


def axis_push(P, a, b, r_min, weight):
    """Push points radially away from segment a-b so they are at least r_min from it (weighted)."""
    c, _ = seg_closest(P, a, b)
    d = P - c
    r = np.linalg.norm(d, axis=1)
    need = np.clip(r_min - r, 0, None) * weight
    return P + d / np.maximum(r, 1e-9)[:, None] * need[:, None]


def drape_from_chest(P, L, factor, bins=24):
    """Fabric hangs from the widest ring around the chest instead of following waist and abdomen."""
    torso = np.abs(P[:, 0]) < L["shoulder_x"] - 0.01
    band = torso & (P[:, 2] > L["chest_low"] - 0.03) & (P[:, 2] < L["chest_low"] + 0.08)
    if band.sum() < bins:
        return P
    cy = float(np.median(P[band, 1]))
    rel = P[:, [0, 1]] - np.array([0.0, cy])
    ang = np.arctan2(rel[:, 1], rel[:, 0])
    r = np.linalg.norm(rel, axis=1)
    b = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins
    r_ring = np.zeros(bins)
    for k in range(bins):
        sel = band & (b == k)
        r_ring[k] = r[sel].max() if sel.any() else 0.0
    r_ring = np.maximum(r_ring, (np.roll(r_ring, 1) + np.roll(r_ring, -1)) * 0.5 * 0.98)
    w = torso * smoothstep(L["chest_low"] + 0.02, L["chest_low"] - 0.12, P[:, 2])
    target = r_ring[b] * factor
    new_r = np.where(r < target, r + (target - r) * w, r)
    out = P.copy()
    out[:, 0] = rel[:, 0] / np.maximum(r, 1e-9) * new_r
    out[:, 1] = cy + rel[:, 1] / np.maximum(r, 1e-9) * new_r
    return out


def neck_center(joints):
    n0 = np.array(jp(joints, "spine.004", "head"))
    return float(n0[0]), float(n0[1])


def tee_spec(L, joints, body):
    s = 1.0 if body == "male" else 0.92
    hides = ["chest", "shoulder_l", "shoulder_r", "torso_lower", "upperarm_a_l", "upperarm_a_r"]
    sleeve_x = L["ua_mid"] + 0.02
    hem_z = L["waist"] - 0.045

    def select(region, c):
        if region in hides or region == "pelvis" or region.startswith("upperarm_b"):
            return True
        if region.startswith("thigh_a"):  # the pelvis band is narrow at the hips: let the hem cut define the edge
            return c[2] > hem_z - 0.05
        return region == "neck" and c[2] < L["collar"] + 0.014

    def offset(P, N):
        belly = smoothstep(L["chest_low"] + 0.05, L["waist"], P[:, 2])
        sleeve = (np.abs(P[:, 0]) > L["shoulder_x"]).astype(float)
        return 0.009 + 0.008 * belly + 0.004 * sleeve

    def loosen(P, B):
        for side, S in ((1, "L"), (-1, "R")):
            sh = np.array(jp(joints, f"upper_arm.{S}", "head"))
            el = np.array(jp(joints, f"forearm.{S}", "head"))
            w = ((np.sign(P[:, 0]) == side) & (np.abs(P[:, 0]) > L["shoulder_x"] + 0.02)).astype(float)
            P = axis_push(P, sh, el, 0.058 * s, w)
        return drape_from_chest(P, L, 0.97 if body == "male" else 0.93)

    cuts = [((0, 0, hem_z), (0, 0, -1), None),
            ((sleeve_x, 0, 0), (1, 0, 0), lambda c: c[0] > 0),
            ((-sleeve_x, 0, 0), (-1, 0, 0), lambda c: c[0] < 0)]
    # crew neck = natural edge of the selection just above the hidden chest region, relaxed into a curve
    neck_loop = lambda c: abs(c[0]) < 0.05 and c[2] > L["collar"] - 0.06
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts,
                relax_boundary_iters=8, relax_filter=neck_loop,
                min_gap=layer_gap(L["waist"] + 0.035, 0.006, TOP_OVER_BOTTOM_GAP), smooth_iters=24, hem_depth=0.007)


def jeans_spec(L, joints, body):
    hides = ["pelvis", "thigh_a_l", "thigh_a_r", "thigh_b_l", "thigh_b_r", "shin_a_l", "shin_a_r", "shin_b_l", "shin_b_r"]
    top_z = L["waist"] + 0.012
    hem_z = L["ankle_z"] + 0.006

    def select(region, c):
        if region in hides:
            return True
        if region == "torso_lower":
            return c[2] < L["waist"] + 0.07
        return region.startswith("foot") and c[2] > L["ankle_z"] - 0.03

    def offset(P, N):
        return 0.007 + 0.004 * smoothstep(L["waist"] - 0.1, L["waist"], P[:, 2])

    def loosen(P, B):
        for side, S in ((1, "L"), (-1, "R")):
            knee = np.array(jp(joints, f"shin.{S}", "head"))
            ankle = np.array(jp(joints, f"foot.{S}", "head"))
            w = ((np.sign(B[:, 0]) == side) & (B[:, 2] < L["knee_z"] + 0.12)).astype(float)
            t = np.clip((knee[2] - P[:, 2]) / max(knee[2] - ankle[2], 1e-6), 0, 1)
            r = (0.060 + 0.006 * t) * (1.0 if body == "male" else 0.93)
            P = axis_push(P, knee + (knee - ankle) * 0.25, ankle - (knee - ankle) * 0.15, r, w)
        return P

    cuts = [((0, 0.0, top_z), (0, -0.22, 1.0), None),   # waistband: back sits a little higher
            ((0, 0, hem_z), (0, 0, -1), None)]
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts,
                min_gap=0.005, smooth_iters=10, hem_depth=0.008)


def hair_short_spec(L, joints, body):
    ear = L["ear"]

    def select(region, c):
        if region != "head":
            return False
        x, y, z = c
        if y < L["eye_y"] + 0.03:  # front: hairline over the forehead, a bit lower at the temples
            return z > L["eye_z"] + 0.055 - 0.02 * smoothstep(0.03, 0.07, abs(x))
        if abs(x) > 0.05 and y < ear[1] + 0.01:  # sideburns in front of the ear
            return z > ear[2] - 0.005
        if y < ear[1] + 0.035 and abs(x) > 0.055:  # over the ear: keep the ear visible
            return z > ear[2] + 0.028
        return z > L["head_z"] - 0.02  # back of the head down to the nape

    def offset(P, N):
        top = smoothstep(L["eye_z"] + 0.03, L["head_top"] - 0.02, P[:, 2])
        front = smoothstep(L["eye_y"] + 0.05, L["eye_y"] + 0.0, P[:, 1]) * top
        return 0.006 + 0.016 * top + 0.006 * front

    return dict(hides=[], select=select, offset=offset, loosen=None, relax_boundary_iters=6,
                min_gap=0.004, smooth_iters=12, hem_depth=0.004)


SPECS = {"top_tee": tee_spec, "bottom_jeans": jeans_spec, "hair_short": hair_short_spec}
HIDES = {}


def build_piece(piece, body):
    _, _, _, _, joints = body_data(body)
    L = landmarks_for(joints)
    spec = SPECS[piece](L, joints, body)
    HIDES[piece] = spec.pop("hides")
    select, offset = spec.pop("select"), spec.pop("offset")
    ob, _ = build_shell(body, piece, select, offset, **spec)
    if piece.startswith("top_"):
        hem_follows_pelvis(ob)
    ob["bar_hides"] = ",".join(HIDES[piece])
    print(piece, body, "verts", len(ob.data.vertices), "tris", tri_count(ob.data), skin_weights_summary(ob))
    return ob


if __name__ == "__main__" or True:
    for body in ("male", "female"):
        for piece in SPECS:
            build_piece(piece, body)
