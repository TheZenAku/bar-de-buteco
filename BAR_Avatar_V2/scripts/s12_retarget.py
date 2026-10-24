"""Step 12 - retarget source clips (assets-bar/anim FBX) onto BAR_HUMANOID_V2 and bake them.

Source skeletons handled: Mixamo (mixamorig:*), Renderpeople Nathan (rp_nathan_animated_003_walking_*,
already canonical names) and the UE4 mannequin (pelvis/clavicle/thigh/calf/ball, mirrored: faces +Y).
Method (same principle as tools/lib/animation-retarget.mjs in the game):
  * a global facing fix turns the source to face -Y with its left on +X
  * rest calibration by real bone directions: C_b rotates the target rest direction onto the source rest
    direction (heads, feet and toes keep their neutral orientation; hands/fingers inherit the parent's C)
  * world rotation  Qt(t) = Qs(t) * Qs_rest^-1 * C_b * Qt_rest, converted to local quaternions in hierarchy order
  * output resampled at 30 fps whatever the source rate; trims in seconds
  * hip translation: source hip delta scaled by the hip-height ratio; horizontal drift removed for loops
  * only rotations are keyed, plus the hip location: bone lengths of each body are never overwritten
Actions are created per body: <Clip>__<body>.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
from mathutils import Quaternion

ANIM_SRC = os.path.join(ROOT, "reference", "anim_src")
FPS = 30

MIXAMO = {"hip": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck": "Neck", "head": "Head"}
UE4 = {"hip": "pelvis", "spine_01": "spine_01", "spine_02": "spine_02", "spine_03": "spine_03", "neck": "neck_01"}
NATHAN = {n: n for n in ("hip", "spine_01", "spine_02", "spine_03", "neck", "head")}
for _s, _S in (("l", "Left"), ("r", "Right")):
    MIXAMO.update({f"shoulder_{_s}": f"{_S}Shoulder", f"upperarm_{_s}": f"{_S}Arm", f"lowerarm_{_s}": f"{_S}ForeArm",
                   f"hand_{_s}": f"{_S}Hand", f"upperleg_{_s}": f"{_S}UpLeg", f"lowerleg_{_s}": f"{_S}Leg",
                   f"foot_{_s}": f"{_S}Foot", f"toe_{_s}": f"{_S}ToeBase"})
    UE4.update({f"shoulder_{_s}": f"clavicle_{_s}", f"upperarm_{_s}": f"upperarm_{_s}", f"lowerarm_{_s}": f"lowerarm_{_s}",
                f"hand_{_s}": f"hand_{_s}", f"upperleg_{_s}": f"thigh_{_s}", f"lowerleg_{_s}": f"calf_{_s}",
                f"foot_{_s}": f"foot_{_s}", f"toe_{_s}": f"ball_{_s}"})
    NATHAN.update({f"{p}_{_s}": f"{p}_{_s}" for p in ("shoulder", "upperarm", "lowerarm", "hand", "upperleg", "lowerleg", "foot")})
    NATHAN[f"toe_{_s}"] = f"ball_{_s}"
    for _f in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for _k in (1, 2, 3):
            MIXAMO[f"{_f.lower()}_0{_k}_{_s}"] = f"{_S}Hand{_f}{_k}"
            UE4[f"{_f.lower()}_0{_k}_{_s}"] = f"{_f.lower()}_0{_k}_{_s}"
            NATHAN[f"{_f.lower()}_0{_k}_{_s}"] = f"{_f.lower()}_0{_k}_{_s}"
END = {"hip": "spine_01", "spine_01": "spine_02", "spine_02": "spine_03", "spine_03": "neck", "neck": "head"}
for _s in ("l", "r"):
    END.update({f"shoulder_{_s}": f"upperarm_{_s}", f"upperarm_{_s}": f"lowerarm_{_s}", f"lowerarm_{_s}": f"hand_{_s}",
                f"upperleg_{_s}": f"lowerleg_{_s}", f"lowerleg_{_s}": f"foot_{_s}"})
NEUTRAL = {"head", "foot_l", "foot_r", "toe_l", "toe_r"}
INHERIT = ("hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")
RIGHT_ARM = ("shoulder_r", "upperarm_r", "lowerarm_r", "hand_r", "thumb_0", "index_0", "middle_0", "ring_0", "pinky_0")

# clip: (file, (start_s, end_s) or None, loop, hip mode, tail blend frames, ground fix)
#   hip mode: "drift" (in place, remove travel), "mean" (in place, centred), "start" (keep relative motion)
CLIPS = {
    # Idle.fbx (the game's current source) is a hunched, nervous look-around; Unarmed Idle 01 is a relaxed
    # standing idle that reads better in a bar and keeps the arms clear of the torso.
    "Idle": ("Unarmed Idle 01.fbx", None, True, "mean", 8, True),
    "Walk": ("Standard Walk.fbx", None, True, "drift", 0, True),
    "Run": ("Run.fbx", None, True, "drift", 0, True),
    "Sit": ("Seated Idle.fbx", None, True, "mean", 10, False),
    "Drink": ("bebendo.fbx", None, False, "mean", 0, True),
    "Dance": ("Samba Dancing.fbx", None, True, "mean", 12, True),
    "Wave": ("Waving Gesture.fbx", None, False, "mean", 0, True),
    "Use": ("Button Pushing.fbx", (0.45, 2.45), False, "mean", 0, True),
    "DrunkIdle": ("Drunk Idle Variation.fbx", None, True, "mean", 12, True),
    "DrunkWalk": ("Drunk Walk.fbx", None, True, "drift", 6, True),
    # bebado-caido.fbx (current game source) is already lying down; a faint needs the fall itself.
    # The source travels ~1.9 m backwards: keep 35 % of the horizontal travel (bar furniture).
    "Fallen": ("Standing Death Backward 01.fbx", None, False, "start:0.35", 0, False),
    "Recover": ("Standing Up.fbx", (0.0, 5.0), False, "start", 0, False),
    "Wait": ("Standing Idle 03.fbx", (0.0, 4.0), True, "mean", 15, True),
    "CardsSit": ("carta-sentado.fbx", None, True, "mean", 10, False),
    "AngrySit": ("sit-angry.fbx", None, True, "mean", 10, False),
    "OldCaneWalk": ("A_Male_Walk_OldCane_walkstyle.fbx", None, True, "drift", 4, True),  # source loop is not closed
}
ALIASES = {"SeatedIdle": "Sit", "Interact": "Use", "Faint": "Fallen"}


def import_source(filename):
    ensure_collection("ANIM_IMPORT")
    lc = bpy.context.view_layer.layer_collection.children["ANIM_IMPORT"]
    bpy.context.view_layer.active_layer_collection = lc
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.fbx(filepath=os.path.join(ANIM_SRC, filename), automatic_bone_orientation=False,
                             ignore_leaf_bones=True, use_anim=True)
    src_fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    new = [bpy.data.objects[n] for n in set(bpy.data.objects.keys()) - before]
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
    arm = next(o for o in new if o.type == "ARMATURE" and o.animation_data and o.animation_data.action)
    names = {b.name for b in arm.data.bones}
    if any(n.endswith("Hips") for n in names):
        prefix = next(n for n in names if n.endswith("Hips")).replace("Hips", "")
        table = {c: prefix + m for c, m in MIXAMO.items()}
    elif any(n.startswith("rp_nathan") for n in names):
        prefix = next(n for n in names if n.endswith("_hip")).replace("hip", "")
        table = {c: prefix + m for c, m in NATHAN.items()}
    else:
        table = dict(UE4)
    return arm, new, table, src_fps


def remove_objects(objs):
    acts = {o.animation_data.action for o in objs if o.animation_data and o.animation_data.action}
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
            elif isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    for a in acts:
        if a.users == 0:
            bpy.data.actions.remove(a)


def world_rot(M):
    return M.to_3x3().normalized().to_quaternion().normalized()


def facing_fix(src, table):
    """Rotation that makes the source face -Y with its left side on +X (target convention)."""
    Ws = src.matrix_world
    l = Ws @ src.data.bones[table["upperleg_l"]].head_local
    r = Ws @ src.data.bones[table["upperleg_r"]].head_local
    side = Vector((l.x - r.x, l.y - r.y, 0.0))
    ang = math.atan2(side.y, side.x)  # target: side along +X
    return Quaternion((0, 0, 1), -ang)


def retarget(src, table, rig, clip, frames_src, in_place, loop, blend_tail, ground):
    scene = bpy.context.scene
    sb = {c: src.data.bones.get(m) for c, m in table.items()}
    sb = {c: b for c, b in sb.items() if b is not None}
    tb = rig.data.bones
    Ws = src.matrix_world
    F = facing_fix(src, table)
    Fm = F.to_matrix().to_4x4()
    Qs_rest = {c: (F @ world_rot(Ws @ b.matrix_local)).normalized() for c, b in sb.items()}
    Ps_rest = {c: Fm @ (Ws @ b.head_local) for c, b in sb.items()}
    Qt_rest = {b.name: b.matrix_local.to_quaternion().normalized() for b in tb}
    Pt_rest = {b.name: b.head_local.copy() for b in tb}
    C = {}
    order = [b.name for b in tb]
    for name in order:
        b = tb[name]
        if name in NEUTRAL or name not in sb:
            C[name] = Quaternion()
            continue
        if name.startswith(INHERIT) and b.parent:
            C[name] = C.get(b.parent.name, Quaternion())
            continue
        end = END.get(name)
        if end and end in sb:
            C[name] = (Pt_rest[end] - Pt_rest[name]).normalized().rotation_difference((Ps_rest[end] - Ps_rest[name]).normalized())
        else:
            C[name] = C.get(b.parent.name, Quaternion()) if b.parent else Quaternion()
    # source hip height above its own feet (some exports are not grounded at z = 0)
    src_floor = min(Ps_rest[f"toe_{s}"].z for s in ("l", "r") if f"toe_{s}" in Ps_rest)
    hip_ratio = Pt_rest["upperleg_l"].z / max(Ps_rest["upperleg_l"].z - src_floor, 1e-6)
    rots = {n: [] for n in order}
    hip_pos = []
    for fs in frames_src:
        scene.frame_set(int(math.floor(fs)), subframe=fs - math.floor(fs))
        Qw = {}
        for name in order:
            b = tb[name]
            if name in sb:
                Qs = (F @ world_rot(Ws @ src.pose.bones[sb[name].name].matrix)).normalized()
                Qw[name] = (Qs @ Qs_rest[name].inverted() @ C[name] @ Qt_rest[name]).normalized()
            else:
                Qw[name] = (Qw[b.parent.name] @ Qt_rest[b.parent.name].inverted() @ Qt_rest[name]) if b.parent else Qt_rest[name]
        for name in order:
            b = tb[name]
            if b.parent:
                p = b.parent.name
                q = Qt_rest[name].inverted() @ Qt_rest[p] @ Qw[p].inverted() @ Qw[name]
            else:
                q = Qt_rest[name].inverted() @ Qw[name]
            rots[name].append(q.normalized())
        hp = Fm @ (Ws @ src.pose.bones[sb["hip"].name].head)
        hip_pos.append(Vector(Pt_rest["hip"]) + (hp - Ps_rest["hip"]) * hip_ratio)
    H = np.array([tuple(p) for p in hip_pos])
    t = np.arange(len(H))
    travel = 1.0
    if in_place.startswith("start:"):
        in_place, travel = "start", float(in_place.split(":")[1])
    for k in (0, 1):
        if in_place == "start":
            H[:, k] = Pt_rest["hip"][k] + (H[:, k] - H[0, k]) * travel
        elif in_place == "drift":
            coef = np.polyfit(t, H[:, k], 1)
            H[:, k] -= np.polyval(coef, t) - Pt_rest["hip"][k]
            H[:, k] -= (H[-1, k] - H[0, k]) * t / max(len(t) - 1, 1)
        elif in_place == "mean":
            H[:, k] -= H[:, k].mean() - Pt_rest["hip"][k]
    if loop and blend_tail > 0:
        n = len(H)
        for name in order:
            q0 = rots[name][0]
            for i in range(n - blend_tail, n):
                w = (i - (n - blend_tail) + 1) / blend_tail
                rots[name][i] = rots[name][i].slerp(q0 if rots[name][i].dot(q0) >= 0 else -q0, w)
        for i in range(n - blend_tail, n):
            w = (i - (n - blend_tail) + 1) / blend_tail
            H[i] = H[i] * (1 - w) + H[0] * w
    act = write_action(rig, clip, rots, H, order)
    act["bar_loop"] = bool(loop)
    act["bar_hip_mode"] = in_place
    if ground:
        ground_fix(rig, act, loop)
    return act


def write_action(rig, clip, rots, H, order):
    tb = rig.data.bones
    name = f"{clip}__{rig['bar_body']}"
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    n = len(H)
    for bname in order:
        fcs = [act.fcurves.new(f'pose.bones["{bname}"].rotation_quaternion', index=i, action_group=bname) for i in range(4)]
        prev = None
        vals = [[], [], [], []]
        for q in rots[bname]:
            if prev is not None and prev.dot(q) < 0:
                q = -q
            prev = q
            for i in range(4):
                vals[i].append(q[i])
        for i, fc in enumerate(fcs):
            fc.keyframe_points.add(n)
            co = np.empty(n * 2)
            co[0::2] = np.arange(n)
            co[1::2] = vals[i]
            fc.keyframe_points.foreach_set("co", co)
            fc.update()
    rest_rot_hip = tb["hip"].matrix_local.to_3x3()
    locs = [(rest_rot_hip.inverted() @ (Vector(h) - tb["hip"].head_local)) for h in H]
    for i in range(3):
        fc = act.fcurves.new('pose.bones["hip"].location', index=i, action_group="hip")
        fc.keyframe_points.add(n)
        co = np.empty(n * 2)
        co[0::2] = np.arange(n)
        co[1::2] = [l[i] for l in locs]
        fc.keyframe_points.foreach_set("co", co)
        fc.update()
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    act["bar_clip"] = clip
    act["bar_fps"] = FPS
    return act


def ground_fix(rig, act, loop, smooth=2):
    """Lift the hip on frames where a planted foot would sink below its rest height (different leg proportions
    than the source skeleton). Never pushes down; the correction is smoothed (cyclically for loops)."""
    scene = bpy.context.scene
    tb = rig.data.bones
    rest = {j: tb[j].head_local.z for j in ("toe_l", "toe_r", "foot_l", "foot_r")}
    n = len(act.fcurves.find('pose.bones["hip"].location', index=0).keyframe_points)
    rig.animation_data.action = act
    pen = np.zeros(n)
    for f in range(n):
        scene.frame_set(f)
        pen[f] = max(0.0, max(rest[j] - rig.pose.bones[j].head.z for j in rest))
    if smooth:
        k = np.ones(2 * smooth + 1) / (2 * smooth + 1)
        ext = np.concatenate([pen[-smooth:], pen, pen[:smooth]]) if loop else np.pad(pen, smooth, mode="edge")
        pen = np.maximum(pen, np.convolve(ext, k, mode="valid"))
    up_local = tb["hip"].matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
    for i in range(3):
        fc = act.fcurves.find('pose.bones["hip"].location', index=i)
        for f, kp in enumerate(fc.keyframe_points):
            kp.co[1] += up_local[i] * pen[f]
        fc.update()
    act["bar_ground_fix_max_m"] = float(pen.max())


def source_frames(src, src_fps, trim):
    a = src.animation_data.action
    f0, f1 = a.frame_range
    dur = (f1 - f0) / src_fps
    t0, t1 = (0.0, dur) if trim is None else (trim[0], min(trim[1], dur))
    n = int(round((t1 - t0) * FPS)) + 1
    return [f0 + (t0 + i / FPS) * src_fps for i in range(n)]


def bake_clips(names, bodies=("male", "female")):
    scene = bpy.context.scene
    out = {}
    for clip in names:
        filename, trim, loop, in_place, tail, ground = CLIPS[clip]
        src, objs, table, src_fps = import_source(filename)
        frames = source_frames(src, src_fps, trim)
        for body in bodies:
            rig = bpy.data.objects[f"RIG_{body}"]
            out[(clip, body)] = retarget(src, table, rig, clip, frames, in_place, loop, tail, ground)
            out[(clip, body)]["bar_source"] = filename
        print(f"{clip:12s} {filename:36s} src {src_fps:.0f} fps -> {len(frames)} frames @{FPS}")
        remove_objects(objs)
    scene.render.fps, scene.render.fps_base = FPS, 1.0
    for a in list(bpy.data.actions):
        if a.users == 0 and "__" not in a.name:
            bpy.data.actions.remove(a)
    return out


def bake_pose_and_cane_hold(bodies=("male", "female")):
    """Pose: static neutral frame (Idle frame 0). OldCaneHold: the Idle with the right arm of the cane walk's
    first frame (same rule as tools/lib/old-cane.mjs)."""
    for body in bodies:
        rig = bpy.data.objects[f"RIG_{body}"]
        idle, cane = bpy.data.actions[f"Idle__{body}"], bpy.data.actions[f"OldCaneWalk__{body}"]
        order = [b.name for b in rig.data.bones]

        def sample(act, f):
            q = {}
            for bname in order:
                q[bname] = Quaternion([act.fcurves.find(f'pose.bones["{bname}"].rotation_quaternion', index=i).evaluate(f) for i in range(4)]).normalized()
            loc = Vector([act.fcurves.find('pose.bones["hip"].location', index=i).evaluate(f) for i in range(3)])
            return q, loc

        rest_hip = rig.data.bones["hip"].matrix_local.to_3x3()
        q0, l0 = sample(idle, 0)
        H = np.array([tuple(rest_hip @ l0 + rig.data.bones["hip"].head_local)] * 2)
        act = write_action(rig, "Pose", {b: [q0[b], q0[b]] for b in order}, H, order)
        act["bar_loop"] = True
        n = int(idle.frame_range[1]) + 1
        qc, _ = sample(cane, 0)
        rots, Hs = {b: [] for b in order}, []
        for f in range(n):
            q, l = sample(idle, f)
            for b in order:
                rots[b].append(qc[b] if b.startswith(RIGHT_ARM) and b.endswith("_r") else q[b])
            Hs.append(tuple(rest_hip @ l + rig.data.bones["hip"].head_local))
        act = write_action(rig, "OldCaneHold", rots, np.array(Hs), order)
        act["bar_loop"] = True
        act["bar_source"] = "Idle + A_Male_Walk_OldCane_walkstyle.fbx (right arm, frame 0)"


ALL_CLIPS = list(CLIPS)

if __name__ == "__main__" or True:
    ACTIONS = bake_clips(ALL_CLIPS)
    bake_pose_and_cane_hold()
