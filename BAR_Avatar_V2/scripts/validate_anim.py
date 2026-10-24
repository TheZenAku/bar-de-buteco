"""Numeric validation of baked clips on a rig (Blender side)."""
import bpy
import math
import numpy as np


def clip_report(rig, action, sample_bones=("hip", "spine_03", "head", "upperarm_l", "lowerarm_r", "hand_l",
                                            "upperleg_l", "lowerleg_r", "foot_l", "toe_r")):
    scene = bpy.context.scene
    rig.animation_data.action = action
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    rep = {"action": action.name, "frames": f1 - f0 + 1, "fps": scene.render.fps,
           "duration_s": round((f1 - f0) / scene.render.fps, 4)}
    # quaternion sanity straight from the curves
    worst = 0.0
    nan = False
    groups = {}
    for fc in action.fcurves:
        if fc.data_path.endswith("rotation_quaternion"):
            groups.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for path, fcs in groups.items():
        vals = np.array([[kp.co[1] for kp in fc.keyframe_points] for fc in fcs])
        nan |= bool(np.isnan(vals).any())
        worst = max(worst, float(np.abs(np.linalg.norm(vals, axis=0) - 1).max()))
    rep["quat_norm_max_error"] = round(worst, 6)
    rep["nan"] = nan
    # evaluated poses
    heads = {b: [] for b in sample_bones}
    mats = {b: [] for b in sample_bones}
    foot_min = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for b in sample_bones:
            pb = rig.pose.bones[b]
            heads[b].append(np.array(pb.head))
            mats[b].append(pb.matrix.to_quaternion())
        foot_min.append(min(rig.pose.bones["foot_l"].head.z, rig.pose.bones["foot_r"].head.z,
                            rig.pose.bones["toe_l"].head.z, rig.pose.bones["toe_r"].head.z))
    def ang(a, b):  # shortest angle: q and -q are the same rotation
        return math.degrees(2 * math.acos(min(1.0, abs(a.dot(b)))))
    loop_rot = max(ang(mats[b][0], mats[b][-1]) for b in sample_bones)
    loop_pos = max(float(np.linalg.norm(heads[b][0] - heads[b][-1])) for b in sample_bones)
    step = 0.0
    for b in sample_bones:
        for i in range(1, len(mats[b])):
            step = max(step, ang(mats[b][i - 1], mats[b][i]))
    hip = np.array(heads["hip"])
    rep.update({
        "loop_seam_max_rot_deg": round(loop_rot, 3),
        "loop_seam_max_pos_m": round(loop_pos, 4),
        "max_rot_step_per_frame_deg": round(step, 3),
        "hip_horizontal_range_m": [round(float(np.ptp(hip[:, 0])), 4), round(float(np.ptp(hip[:, 1])), 4)],
        "hip_vertical_range_m": round(float(np.ptp(hip[:, 2])), 4),
        "hip_net_horizontal_travel_m": round(float(np.linalg.norm(hip[-1, :2] - hip[0, :2])), 4),
        "lowest_foot_joint_m": round(float(min(foot_min)), 4),
        "highest_lowest_foot_joint_m": round(float(max(foot_min)), 4),
    })
    return rep
