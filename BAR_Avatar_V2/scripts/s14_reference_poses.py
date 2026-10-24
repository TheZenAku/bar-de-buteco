"""Step 14 - dump reference joint positions (master file) used by the independent GLB validation.
Every exported clip is sampled at 0, 25, 50, 75 and 100 % of its length."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

JOINTS = ["hip", "spine_03", "head", "hand_l", "hand_r", "middle_01_l", "foot_l", "foot_r", "toe_l", "lowerarm_r"]
CLIPS = ["Idle", "Walk", "Run", "Sit", "Drink", "Dance", "Wave", "Use", "DrunkIdle", "DrunkWalk", "Fallen", "Recover",
         "Wait", "CardsSit", "AngrySit", "Pose", "OldCaneWalk", "OldCaneHold"]
FRACTIONS = [0.0, 0.25, 0.5, 0.75, 1.0]


def dump():
    out = {}
    scene = bpy.context.scene
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        loc = rig.location.copy()
        rig.location = (0, 0, 0)
        ad = rig.animation_data
        out[body] = {"rest": {j: list(rig.data.bones[j].head_local) for j in JOINTS}}
        for clip in CLIPS:
            act = bpy.data.actions[f"{clip}__{body}"]
            ad.action = act
            last = int(act.frame_range[1])
            out[body][clip] = {"frames": last + 1, "samples": {}}
            for fr in FRACTIONS:
                f = int(round(fr * last))
                scene.frame_set(f)
                out[body][clip]["samples"][str(f)] = {j: list(rig.matrix_world @ rig.pose.bones[j].head) for j in JOINTS}
        # rigid accessories: world centre of the (bone-driven) mesh in a few poses
        acc = {}
        for o in bpy.data.objects:
            if o.type == "MESH" and o.name.startswith("accessory_") and o.name.endswith(f"__{body}"):
                pid = o.name[: -len(body) - 2]
                acc[pid] = {}
                for clip, f in (("rest", 0), ("Walk", 7), ("Dance", 200)):
                    ad.action = None if clip == "rest" else bpy.data.actions[f"{clip}__{body}"]
                    if clip == "rest":
                        for pb in rig.pose.bones:
                            pb.rotation_quaternion = (1, 0, 0, 0)
                            pb.location = (0, 0, 0)
                    scene.frame_set(f)
                    dg = bpy.context.evaluated_depsgraph_get()
                    ev = o.evaluated_get(dg)
                    me = ev.to_mesh()
                    pts = np.array([tuple(o.matrix_world @ v.co) for v in me.vertices])
                    c = (pts.min(0) + pts.max(0)) / 2  # bbox centre: invariant to vertex splitting on export
                    ev.to_mesh_clear()
                    acc[pid][f"{clip}:{f}"] = [float(x) for x in c]
        out[body]["accessories"] = acc
        # materials each exported mesh really uses (slots referenced by polygons), with export names
        mats = {}
        for o in bpy.data.objects:
            if o.type == "MESH" and (o.name.endswith(f"__{body}") or o.name == f"BAR_Body_{body.capitalize()}"):
                used = {p.material_index for p in o.data.polygons}
                node = o.name.rsplit("__", 1)[0] if "__" in o.name else "BAR_Body"
                mats[node] = sorted({o.data.materials[i].name.split("__")[0] for i in used if i < len(o.data.materials) and o.data.materials[i]})
        out[body]["materials"] = mats
        out[body]["morph_targets"] = {o.name.rsplit("__", 1)[0] if "__" in o.name else "BAR_Body":
                                      [k.name for k in o.data.shape_keys.key_blocks[1:]]
                                      for o in bpy.data.objects if o.type == "MESH" and o.data.shape_keys and
                                      (o.name.endswith(f"__{body}") or o.name == f"BAR_Body_{body.capitalize()}")}
        ad.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        rig.location = loc
    save_json(os.path.join(EXPORT, "validation", "reference_poses.json"), {"fps": scene.render.fps, "clips": CLIPS, "poses": out})
    print("reference poses written")


dump()
