"""Step 14b - Blender-side numeric report of every baked clip (validate_anim.clip_report) on its own rig.
Writes export/validation/animation-report-blender.json; s25 turns it into pass/fail criteria."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(os.path.join(ROOT, "scripts", "validate_anim.py"), encoding="utf-8").read())
import ast

_tree = ast.parse(open(os.path.join(ROOT, "scripts", "s14_reference_poses.py"), encoding="utf-8").read())
CLIPS = next(ast.literal_eval(n.value) for n in _tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "CLIPS")


def lowest_body_point(rig, act, body_ob):
    """Lowest point of the deformed body mesh over the clip (every 2nd frame, every 4th on long clips)."""
    scene = bpy.context.scene
    rig.animation_data.action = act
    n = int(round(act.frame_range[1])) + 1
    M = np.array(body_ob.matrix_world)
    low = (1e9, 0)
    for f in range(0, n, 4 if n > 200 else 2):
        scene.frame_set(f)
        ev = body_ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        z = float(((M[:3, :3] @ co.reshape(-1, 3).T)[2] + M[2, 3]).min())
        ev.to_mesh_clear()
        low = min(low, (z, f))
    return round(low[0], 4), low[1]


def report():
    out = []
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        body_ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
        loc = rig.location.copy()
        rig.location = (0, 0, 0)
        rig.animation_data_create()
        for clip in sorted(CLIPS):
            act = bpy.data.actions[f"{clip}__{body}"]
            r = clip_report(rig, act)
            r["lowest_body_mesh_m"], r["lowest_body_mesh_frame"] = lowest_body_point(rig, act, body_ob)
            r.update({"ground_fix_max_m": round(float(act.get("bar_ground_fix_max_m", 0)), 4),
                      "mesh_ground_fix_max_m": round(float(act.get("bar_mesh_ground_fix_max_m", 0)), 4),
                      "loop": bool(act.get("bar_loop", False)), "source": act.get("bar_source", ""),
                      "hip_mode": act.get("bar_hip_mode", "")})
            out.append(r)
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        rig.location = loc
    save_json(os.path.join(EXPORT, "validation", "animation-report-blender.json"), out)
    print("animation report:", len(out), "clips")
    return out


ANIM_REPORT = report()
