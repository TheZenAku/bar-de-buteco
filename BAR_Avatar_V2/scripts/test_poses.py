"""Deformation stress poses for validation renders (applied in pose mode, never to rest)."""
import bpy
import math
from mathutils import Euler, Quaternion, Vector

# (bone, world-space axis, degrees). Applied as world rotations so they are roll-independent.
POSES = {
    "rest": [],
    "stress": [
        ("upperarm_l", (0, 1, 0), -70), ("lowerarm_l", (0, 0, 1), 95),
        ("upperarm_r", (0, 1, 0), 60), ("lowerarm_r", (0, 0, 1), -20),
        ("upperleg_l", (1, 0, 0), -85), ("lowerleg_l", (1, 0, 0), 95),
        ("upperleg_r", (1, 0, 0), 25), ("lowerleg_r", (1, 0, 0), 30),
        ("spine_02", (1, 0, 0), -15), ("spine_03", (0, 0, 1), 15), ("head", (1, 0, 0), 15),
        ("index_01_l", (0, 1, 0), 40), ("middle_01_l", (0, 1, 0), 60), ("ring_01_l", (0, 1, 0), 70),
        ("pinky_01_l", (0, 1, 0), 70),
    ],
    "sit": [
        ("upperleg_l", (1, 0, 0), 90), ("lowerleg_l", (1, 0, 0), -90),
        ("upperleg_r", (1, 0, 0), 90), ("lowerleg_r", (1, 0, 0), -90),
        ("upperarm_l", (0, 1, 0), 70), ("upperarm_r", (0, 1, 0), -70),
        ("lowerarm_l", (0, 0, 1), 40), ("lowerarm_r", (0, 0, 1), -40),
    ],
    "arms_up": [("upperarm_l", (0, 1, 0), -80), ("upperarm_r", (0, 1, 0), 80),
                ("shoulder_l", (0, 1, 0), -15), ("shoulder_r", (0, 1, 0), 15)],
}


def apply_pose(rig, name):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    for bone, axis, deg in POSES[name]:
        pb = rig.pose.bones[bone]
        # world rotation about the bone head, converted to the bone's local frame
        R = Quaternion(Vector(axis), math.radians(deg))
        M = pb.matrix.copy()
        loc = M.to_translation()
        new = R.to_matrix().to_4x4() @ M.to_3x3().to_4x4()
        new.translation = loc
        pb.matrix = new
        bpy.context.view_layer.update()
