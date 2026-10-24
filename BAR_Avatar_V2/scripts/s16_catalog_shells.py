"""Step 16 - catalogue pieces built as body shells (tops, bottoms).

New geometry: top_shirt, top_tank, top_hoodie, top_jacket, bottom_shorts, bottom_skirt (female only).
Texture-only variants (reuse geometry, see s17): top_tee_print -> top_tee, bottom_pants -> bottom_jeans.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s09_shell_pieces.py", encoding="utf-8").read().split("SPECS = {")[0])

TORSO_HIDES = ["chest", "shoulder_l", "shoulder_r", "torso_lower"]


def sleeve_push(P, L, joints, body, upto="upper", r_upper=0.058, r_fore=0.047):
    s = 1.0 if body == "male" else 0.92
    for side, S in ((1, "L"), (-1, "R")):
        sh = np.array(jp(joints, f"upper_arm.{S}", "head"))
        el = np.array(jp(joints, f"forearm.{S}", "head"))
        wr = np.array(jp(joints, f"forearm.{S}", "tail"))
        on = (np.sign(P[:, 0]) == side)
        w = (on & (np.abs(P[:, 0]) > L["shoulder_x"] + 0.02) & (np.abs(P[:, 0]) <= abs(el[0]) + 0.01)).astype(float)
        P = axis_push(P, sh, el, r_upper * s, w)
        if upto == "wrist":
            w2 = (on & (np.abs(P[:, 0]) > abs(el[0]) - 0.01)).astype(float)
            t = np.clip((np.abs(P[:, 0]) - abs(el[0])) / max(abs(wr[0]) - abs(el[0]), 1e-6), 0, 1)
            P = axis_push(P, el, wr, (r_fore - 0.006 * t) * s, w2)
    return P


def long_sleeve_cuts(L, inset=0.012):
    x = L["wrist_x"] - inset
    return [((x, 0, 0), (1, 0, 0), lambda c: c[0] > 0), ((-x, 0, 0), (-1, 0, 0), lambda c: c[0] < 0)]


def shirt_spec(L, joints, body):
    """Casual short-sleeve button shirt: looser than the tee, longer hem, collar band."""
    hides = TORSO_HIDES + ["upperarm_a_l", "upperarm_a_r"]
    hem_z = L["waist"] - 0.07
    sleeve_x = L["ua_mid"] + 0.035

    def select(region, c):
        if region in hides or region in ("pelvis",) or region.startswith("upperarm_b"):
            return True
        if region.startswith("thigh_a"):
            return c[2] > hem_z - 0.05
        return region == "neck" and c[2] < L["collar"] + 0.03

    def offset(P, N):
        belly = smoothstep(L["chest_low"] + 0.05, L["waist"], P[:, 2])
        neck = smoothstep(L["collar"] - 0.01, L["collar"] + 0.02, P[:, 2])
        return 0.012 + 0.010 * belly + 0.004 * neck

    def loosen(P, B):
        P = sleeve_push(P, L, joints, body, r_upper=0.064)
        return drape_from_chest(P, L, 1.0 if body == "male" else 0.95)

    cuts = [((0, 0, hem_z), (0, 0, -1), None),
            ((sleeve_x, 0, 0), (1, 0, 0), lambda c: c[0] > 0), ((-sleeve_x, 0, 0), (-1, 0, 0), lambda c: c[0] < 0)]
    neck_loop = lambda c: abs(c[0]) < 0.05 and c[2] > L["collar"] - 0.06
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts, relax_boundary_iters=8,
                relax_filter=neck_loop, min_gap=layer_gap(L["waist"] + 0.035, 0.007, TOP_OVER_BOTTOM_GAP), smooth_iters=24, hem_depth=0.008)


def tank_spec(L, joints, body):
    """Tank top: shoulders and upper chest exposed (scoop neck, deep armholes); only the belly is hidden."""
    hides = ["torso_lower"]
    hem_z = L["waist"] - 0.04

    strap_in, strap_out = (0.058, 0.096) if body == "male" else (0.052, 0.088)
    # female: the neckline must sit above the painted bra (s07 paints it up to breast + 0.045)
    bust_line = L["chest_low"] + 0.06 if body == "male" else float(jp(joints, "breast.L", "head")[2]) + 0.06

    def select(region, c):
        if region == "torso_lower" or region == "pelvis":
            return True
        if region.startswith("thigh_a"):
            return c[2] > hem_z - 0.05
        if region in ("chest", "shoulder_l", "shoulder_r"):
            if c[2] < bust_line:
                return region == "chest"  # armholes: the lower shoulder area stays open
            return strap_in < abs(c[0]) < strap_out  # above the bust only the straps remain
        return region == "neck" and strap_in < abs(c[0]) < strap_out and c[2] < L["collar"] + 0.02

    def offset(P, N):
        return 0.008 + 0.008 * smoothstep(L["chest_low"] + 0.05, L["waist"], P[:, 2])

    def loosen(P, B):
        return drape_from_chest(P, L, 0.97 if body == "male" else 0.93)

    cuts = [((0, 0, hem_z), (0, 0, -1), None)]
    upper = lambda c: c[2] > L["chest_low"] - 0.05
    # light relax only: stronger relaxing pulls the narrow straps down into a strapless edge
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts, relax_boundary_iters=2,
                relax_filter=upper, min_gap=layer_gap(L["waist"] + 0.035, 0.006, TOP_OVER_BOTTOM_GAP), smooth_iters=26, hem_depth=0.006)


def hoodie_spec(L, joints, body):
    """Hoodie: long sleeves, ribbed cuffs/hem, bulky hood resting on the upper back."""
    hides = TORSO_HIDES + [f"{p}_{s}" for p in ("upperarm_a", "upperarm_b", "lowerarm_a", "lowerarm_b") for s in ("l", "r")]
    hem_z = L["waist"] - 0.07

    def select(region, c):
        if region in hides or region == "pelvis":
            return True
        if region.startswith("thigh_a"):
            return c[2] > hem_z - 0.05
        if region.startswith("hand"):
            return abs(c[0]) < L["wrist_x"] + 0.01
        return region == "neck" and (c[2] < L["collar"] + 0.035 or c[1] > 0.03)

    def offset(P, N):
        belly = smoothstep(L["chest_low"] + 0.05, L["waist"], P[:, 2])
        hood = smoothstep(L["collar"] - 0.04, L["collar"] + 0.03, P[:, 2]) * smoothstep(-0.01, 0.06, P[:, 1])
        return 0.016 + 0.010 * belly + 0.022 * hood

    def loosen(P, B):
        P = sleeve_push(P, L, joints, body, upto="wrist", r_upper=0.068, r_fore=0.056)
        return drape_from_chest(P, L, 1.03 if body == "male" else 0.98)

    neck_loop = lambda c: abs(c[0]) < 0.08 and c[2] > L["collar"] - 0.06
    return dict(hides=hides, select=select, offset=offset, loosen=loosen,
                cuts=[((0, 0, hem_z), (0, 0, -1), None)] + long_sleeve_cuts(L, 0.008),
                relax_boundary_iters=10, relax_filter=neck_loop, min_gap=layer_gap(L["waist"] + 0.035, 0.010, TOP_OVER_BOTTOM_GAP), smooth_iters=26, hem_depth=0.012)


def jacket_spec(L, joints, body):
    """Zip jacket (bomber): long sleeves, stand collar, hem below the waist."""
    hides = TORSO_HIDES + [f"{p}_{s}" for p in ("upperarm_a", "upperarm_b", "lowerarm_a", "lowerarm_b") for s in ("l", "r")]
    hem_z = L["waist"] - 0.085

    def select(region, c):
        if region in hides or region == "pelvis":
            return True
        if region.startswith("thigh_a"):
            return c[2] > hem_z - 0.05
        if region.startswith("hand"):
            return abs(c[0]) < L["wrist_x"] + 0.01
        return region == "neck" and c[2] < L["collar"] + 0.05

    def offset(P, N):
        belly = smoothstep(L["chest_low"] + 0.05, L["waist"], P[:, 2])
        collar = smoothstep(L["collar"] - 0.01, L["collar"] + 0.03, P[:, 2])
        return 0.020 + 0.010 * belly + 0.006 * collar

    def loosen(P, B):
        P = sleeve_push(P, L, joints, body, upto="wrist", r_upper=0.070, r_fore=0.058)
        return drape_from_chest(P, L, 1.04 if body == "male" else 1.0)

    neck_loop = lambda c: abs(c[0]) < 0.08 and c[2] > L["collar"] - 0.06
    return dict(hides=hides, select=select, offset=offset, loosen=loosen,
                cuts=[((0, 0, hem_z), (0, 0, -1), None)] + long_sleeve_cuts(L, 0.004),
                relax_boundary_iters=10, relax_filter=neck_loop, min_gap=layer_gap(L["waist"] + 0.035, 0.012, TOP_OVER_BOTTOM_GAP + 0.004), smooth_iters=26, hem_depth=0.014)


def shorts_spec(L, joints, body):
    hides = ["pelvis", "thigh_a_l", "thigh_a_r"]
    top_z = L["waist"] + 0.012
    hem_z = L["thigh_mid"] - 0.03

    def select(region, c):
        if region in hides or region.startswith("thigh_b"):
            return True
        return region == "torso_lower" and c[2] < L["waist"] + 0.07

    def offset(P, N):
        return 0.009 + 0.004 * smoothstep(L["waist"] - 0.1, L["waist"], P[:, 2])

    def loosen(P, B):
        for side, S in ((1, "L"), (-1, "R")):
            hip = np.array(jp(joints, f"thigh.{S}", "head"))
            knee = np.array(jp(joints, f"shin.{S}", "head"))
            w = ((np.sign(B[:, 0]) == side) & (B[:, 2] < L["crotch"] + 0.02)).astype(float)
            P = axis_push(P, hip, knee, (0.085 if body == "male" else 0.08), w)
        return P

    cuts = [((0, 0.0, top_z), (0, -0.22, 1.0), None), ((0, 0, hem_z), (0, 0, -1), None)]
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts,
                min_gap=0.006, smooth_iters=10, hem_depth=0.009)


def skirt_spec(L, joints, body):
    """A-line skirt to just above the knee. The lower part is re-weighted (see skirt_weights) so it does not
    stretch between the legs: hip + both thighs blended by height and side."""
    hides = ["pelvis", "thigh_a_l", "thigh_a_r"]
    top_z = L["waist"] + 0.01
    hem_z = L["knee_z"] + 0.07

    def select(region, c):
        if region in hides or region.startswith("thigh_b"):
            return True
        return region == "torso_lower" and c[2] < L["waist"] + 0.07

    def offset(P, N):
        return 0.008 + 0.004 * smoothstep(L["waist"] - 0.1, L["waist"], P[:, 2])

    def loosen(P, B):
        # cone around the body axis: radius grows linearly below the hips (A-line), legs merge into one tube
        cy = float(np.median(P[:, 1]))
        rel = P[:, [0, 1]] - np.array([0.0, cy])
        r = np.linalg.norm(rel, axis=1)
        ang = np.arctan2(rel[:, 1], rel[:, 0])
        z = P[:, 2]
        t = np.clip((L["hip_z"] - z) / max(L["hip_z"] - hem_z, 1e-6), 0, 1)
        hip_r = np.percentile(r[(z > L["hip_z"] - 0.06) & (z < L["hip_z"] + 0.02)], 92)
        target = hip_r * (1.0 + 0.32 * t) * (1 + 0.08 * np.abs(np.sin(ang)) * 0)
        new_r = np.where(z < L["hip_z"], np.maximum(r * (1 - t) + target * t, r), r)
        out = P.copy()
        out[:, 0] = rel[:, 0] / np.maximum(r, 1e-9) * new_r
        out[:, 1] = cy + rel[:, 1] / np.maximum(r, 1e-9) * new_r
        return out

    cuts = [((0, 0.0, top_z), (0, -0.22, 1.0), None), ((0, 0, hem_z), (0, 0, -1), None)]
    return dict(hides=hides, select=select, offset=offset, loosen=loosen, cuts=cuts,
                min_gap=0.008, smooth_iters=18, hem_depth=0.008)


def skirt_weights(ob, L):
    """Below the hip line blend hip <-> thighs by height, and left/right thighs by side, so the A-line skirt
    swings with the legs without tearing between them."""
    names = [g.name for g in ob.vertex_groups]
    for n in ("hip", "upperleg_l", "upperleg_r"):
        if n not in names:
            ob.vertex_groups.new(name=n)
    gi = {g.name: g.index for g in ob.vertex_groups}
    for v in ob.data.vertices:
        z, x = v.co.z, v.co.x
        if z > L["hip_z"]:
            continue
        t = min(1.0, (L["hip_z"] - z) / max(L["hip_z"] - (L["knee_z"] + 0.07), 1e-6))
        side = 0.5 + 0.5 * math.tanh(x / 0.04)
        w = {"hip": 1 - 0.75 * t, "upperleg_l": 0.75 * t * side, "upperleg_r": 0.75 * t * (1 - side)}
        for g in list(v.groups):
            ob.vertex_groups[g.group].remove([v.index])
        for n, x_ in w.items():
            if x_ > 0.01:
                ob.vertex_groups[gi[n]].add([v.index], x_, "REPLACE")


CATALOG_SHELLS = {
    "top_shirt": (shirt_spec, ("male", "female")),
    "top_tank": (tank_spec, ("male", "female")),
    "top_hoodie": (hoodie_spec, ("male", "female")),
    "top_jacket": (jacket_spec, ("male", "female")),
    "bottom_shorts": (shorts_spec, ("male", "female")),
    # bottom_skirt: built as a single tube in s16b_skirt_loft.py (a leg-derived shell tears between the legs)
}


def build_catalog_shells(only=None):
    built = []
    for piece, (spec_fn, bodies) in CATALOG_SHELLS.items():
        if only and piece not in only:
            continue
        for body in bodies:
            _, _, _, _, joints = body_data(body)
            L = landmarks_for(joints)
            spec = spec_fn(L, joints, body)
            hides = spec.pop("hides")
            select, offset = spec.pop("select"), spec.pop("offset")
            ob, _ = build_shell(body, piece, select, offset, **spec)
            if piece == "bottom_skirt":
                skirt_weights(ob, L)
            if piece.startswith("top_"):
                hem_follows_pelvis(ob)
            ob["bar_hides"] = ",".join(hides)
            print(piece, body, "verts", len(ob.data.vertices), "tris", tri_count(ob.data), skin_weights_summary(ob))
            built.append(ob)
    return built


if __name__ == "__main__" or True:
    BUILT = build_catalog_shells()
