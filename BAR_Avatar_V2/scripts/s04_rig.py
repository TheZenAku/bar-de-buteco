"""Step 04 - canonical skeleton BAR_HUMANOID_V2 built from the CharMorph joint data of each body shape.

Bone names follow the game's canonical (Quaternius/UE style) names already used by BarScene.ts,
drink-props.ts and animation-retarget.mjs: hip, spine_01..03, neck, head, shoulder_l, upperarm_l,
lowerarm_l, hand_l, <finger>_0N_l, upperleg_l, lowerleg_l, foot_l, toe_l (+ _r).
Rest pose: T-pose, arms along +/-X, palms down, character facing -Y (glTF +Z), left side on +X.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

HIER = json.load(open(os.path.join(CACHE, "antonia_metarig_hierarchy.json"), encoding="utf-8"))
UP, FWD = (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)
FINGERS = ("thumb", "index", "middle", "ring", "pinky")
SRC_FINGER = {"thumb": "thumb", "index": "f_index", "middle": "f_middle", "ring": "f_ring", "pinky": "f_pinky"}


def jp(joints, bone, end):
    key = f"{bone}_{end}"
    if key in joints:
        return Vector(joints[key])
    parent = HIER[bone][0]
    if end == "head" and parent:
        return jp(joints, parent, "tail")
    raise KeyError(key)


def bone_table(joints):
    """[(name, head, tail, parent, roll_reference)] in hierarchy order."""
    t = []
    sp = lambda b, e: jp(joints, b, e)
    hip_head = sp("spine", "head")
    t.append(("root", Vector((0, 0, 0)), Vector((0, 0, 0.18)), None, FWD))
    t.append(("hip", hip_head, sp("spine.001", "head"), "root", FWD))
    t.append(("spine_01", sp("spine.001", "head"), sp("spine.002", "head"), "hip", FWD))
    t.append(("spine_02", sp("spine.002", "head"), sp("spine.003", "head"), "spine_01", FWD))
    t.append(("spine_03", sp("spine.003", "head"), sp("spine.004", "head"), "spine_02", FWD))
    t.append(("neck", sp("spine.004", "head"), sp("spine.006", "head"), "spine_03", FWD))
    t.append(("head", sp("spine.006", "head"), sp("spine.006", "tail"), "neck", FWD))
    for s, S in (("l", "L"), ("r", "R")):
        t.append((f"shoulder_{s}", sp(f"shoulder.{S}", "head"), sp(f"upper_arm.{S}", "head"), "spine_03", UP))
        t.append((f"upperarm_{s}", sp(f"upper_arm.{S}", "head"), sp(f"forearm.{S}", "head"), f"shoulder_{s}", UP))
        t.append((f"lowerarm_{s}", sp(f"forearm.{S}", "head"), sp(f"hand.{S}", "head"), f"upperarm_{s}", UP))
        t.append((f"hand_{s}", sp(f"hand.{S}", "head"), sp(f"f_middle.01.{S}", "head"), f"lowerarm_{s}", UP))
        for f in FINGERS:
            parent = f"hand_{s}"
            for k in (1, 2, 3):
                src = f"{SRC_FINGER[f]}.0{k}.{S}"
                name = f"{f}_0{k}_{s}"
                t.append((name, sp(src, "head"), sp(src, "tail"), parent, UP))
                parent = name
        t.append((f"upperleg_{s}", sp(f"thigh.{S}", "head"), sp(f"shin.{S}", "head"), "hip", FWD))
        t.append((f"lowerleg_{s}", sp(f"shin.{S}", "head"), sp(f"foot.{S}", "head"), f"upperleg_{s}", FWD))
        t.append((f"foot_{s}", sp(f"foot.{S}", "head"), sp(f"toe.{S}", "head"), f"lowerleg_{s}", UP))
        t.append((f"toe_{s}", sp(f"toe.{S}", "head"), sp(f"toe.{S}", "tail"), f"foot_{s}", UP))
    return t


def socket_table(joints, V):
    """Attachment sockets: (name, parent bone, world position). Orientation = world axes in the rest pose."""
    sp = lambda b, e: jp(joints, b, e)
    eye_l, eye_r = sp("eye.L", "head"), sp("eye.R", "head")
    head_pts = V[V[:, 2] > sp("spine.006", "head").z]
    top = Vector((0.0, float(np.median(head_pts[head_pts[:, 2] > head_pts[:, 2].max() - 0.01][:, 1])), float(head_pts[:, 2].max())))
    front_y = float(head_pts[np.abs(head_pts[:, 0]) < 0.01][:, 1].min())
    bridge = (eye_l + eye_r) / 2
    lips = [sp(n, "head") for n in ("lip.T.L", "lip.T.R", "lip.B.L", "lip.B.R")]
    mouth = sum(lips, Vector()) / 4
    out = [
        ("socket_head_top", "head", top),
        ("socket_glasses", "head", Vector((0.0, min(eye_l.y, eye_r.y) - 0.012, bridge.z))),
        ("socket_eye_l", "head", eye_l),
        ("socket_eye_r", "head", eye_r),
        ("socket_mouth", "head", Vector((0.0, mouth.y, mouth.z))),
        ("socket_hip", "hip", sp("spine", "head")),
    ]
    for s, S in (("l", "L"), ("r", "R")):
        wrist, knuckle = sp(f"hand.{S}", "head"), sp(f"f_middle.01.{S}", "head")
        palm = wrist.lerp(knuckle, 0.55)
        out.append((f"socket_palm_{s}", f"hand_{s}", palm + Vector((0, 0, -0.018))))
        out.append((f"socket_hand_{s}", f"hand_{s}", wrist.lerp(knuckle, 0.75) + Vector((0, 0, -0.035))))
        ankle = sp(f"foot.{S}", "head")
        toe = sp(f"toe.{S}", "head")
        out.append((f"socket_foot_{s}", f"foot_{s}", Vector((ankle.x, (ankle.y + toe.y) / 2, 0.0))))
        elbow = sp(f"forearm.{S}", "head")
        out.append((f"socket_wrist_{s}", f"lowerarm_{s}", wrist.lerp(elbow, 0.08)))
    del front_y
    return out


def add_sockets(rig, joints, V, only_missing=True):
    body = rig["bar_body"]
    col = rig.users_collection[0]
    have = {o.get("bar_socket") for o in rig.children if o.type == "EMPTY"}
    made = []
    for name, parent, pos in socket_table(joints, V):
        if only_missing and name in have:
            continue
        e = bpy.data.objects.new(f"{name}__{body}", None)
        e.empty_display_type = "ARROWS"
        e.empty_display_size = 0.04
        col.objects.link(e)
        e.parent = rig
        e.parent_type = "BONE"
        e.parent_bone = parent
        e["bar_socket"] = name
        bpy.context.view_layer.update()
        e.matrix_world = rig.matrix_world @ Matrix.Translation(pos)
        made.append(e.name)
    return made


def build_rig(body, V):
    joints = compute_joints(V)
    rig_name = f"RIG_{body}"
    for o in [o for o in bpy.data.objects if o.name == rig_name or (o.parent and o.parent.name == rig_name and o.type == "EMPTY")]:
        bpy.data.objects.remove(o, do_unlink=True)
    arm = bpy.data.armatures.new(f"{RIG_ID}_{body}")
    rig = bpy.data.objects.new(rig_name, arm)
    col = ensure_collection(f"BODY_{body.upper()}")
    col.objects.link(rig)
    arm.display_type = "STICK"
    rig.show_in_front = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    table = bone_table(joints)
    for name, h, tl, parent, ref in table:
        b = eb.new(name)
        b.head, b.tail = h, tl
        b.align_roll(Vector(ref))
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        b.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    rig["bar_body"] = body
    add_sockets(rig, joints, V, only_missing=False)
    rig["bar_rig_id"] = RIG_ID
    rig["bar_contract_version"] = RIG_CONTRACT_VERSION
    rig["bar_body"] = body
    print(rig_name, "bones", len(arm.bones), "deform", sum(b.use_deform for b in arm.bones))
    return rig, joints


RIGS = {}
for body in ("female", "male"):
    RIGS[body] = build_rig(body, np.load(os.path.join(CACHE, f"{body}.npy")))
