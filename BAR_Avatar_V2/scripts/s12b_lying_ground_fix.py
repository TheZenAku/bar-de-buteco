"""Step 12b - floor contact for the clips that lie on the ground (Fallen, Recover).

The joint-based ground_fix of s12 only looks at the feet; lying down, the retargeted hip height (scaled by the
leg ratio) put the back and head of the body up to 22 cm under the floor. Here the deformed body mesh is
evaluated per frame and the hip is lifted so the lowest non-foot point stays CLEARANCE above the floor (room for
clothing) and the feet never go below it. Never pushes down; smoothed without dropping under the requirement.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

LYING_CLIPS = ("Fallen", "Recover")
CLEARANCE = 0.012
SMOOTH = 3
REGIONS = json.load(open(os.path.join(CACHE, "body_regions.json"), encoding="utf-8"))["regions"]


def foot_vertex_mask(body_ob):
    me = body_ob.data
    reg = int_array(me.attributes["body_region"].data, "value")
    feet = {REGIONS.index("foot_l"), REGIONS.index("foot_r")}
    mask = np.zeros(len(me.vertices), bool)
    for p in me.polygons:
        if reg[p.index] in feet:
            mask[list(p.vertices)] = True
    return mask


def lowest_points(rig, act, body_ob, feet):
    scene = bpy.context.scene
    rig.animation_data.action = act
    n = len(act.fcurves.find('pose.bones["hip"].location', index=0).keyframe_points)
    M = np.array(body_ob.matrix_world)
    body_low, foot_low = np.zeros(n), np.zeros(n)
    for f in range(n):
        scene.frame_set(f)
        ev = body_ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        z = (M[:3, :3] @ co.reshape(-1, 3).T)[2] + M[2, 3]
        ev.to_mesh_clear()
        body_low[f], foot_low[f] = z[~feet].min(), z[feet].min()
    return body_low, foot_low


def lying_ground_fix(body):
    rig = bpy.data.objects[f"RIG_{body}"]
    body_ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    loc = rig.location.copy()
    rig.location = (0, 0, 0)
    feet = foot_vertex_mask(body_ob)
    up_local = rig.data.bones["hip"].matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
    out = {}
    for clip in LYING_CLIPS:
        act = bpy.data.actions[f"{clip}__{body}"]
        body_low, foot_low = lowest_points(rig, act, body_ob, feet)
        lift = np.maximum(0.0, np.maximum(CLEARANCE - body_low, -foot_low))
        k = np.ones(2 * SMOOTH + 1) / (2 * SMOOTH + 1)
        lift = np.maximum(lift, np.convolve(np.pad(lift, SMOOTH, mode="edge"), k, mode="valid"))
        for i in range(3):
            fc = act.fcurves.find('pose.bones["hip"].location', index=i)
            for f, kp in enumerate(fc.keyframe_points):
                kp.co[1] += up_local[i] * lift[f]
                kp.handle_left[1] += up_local[i] * lift[f]
                kp.handle_right[1] += up_local[i] * lift[f]
            fc.update()
        act["bar_mesh_ground_fix_max_m"] = float(lift.max())
        after_body, after_foot = lowest_points(rig, act, body_ob, feet)
        out[clip] = {"lift_max_m": round(float(lift.max()), 4), "before_min_m": round(float(min(body_low.min(), foot_low.min())), 4),
                     "after_min_m": round(float(min(after_body.min(), after_foot.min())), 4)}
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    rig.location = loc
    return out


LYING_FIX = {b: lying_ground_fix(b) for b in ("male", "female")}
print("lying ground fix:", LYING_FIX)
