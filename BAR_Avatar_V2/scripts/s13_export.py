"""Step 13 - GLB export of rigs, bodies, the modular catalogue and the animation banks.

Contract highlights
  * every skinned file contains the same armature node 'BAR_HUMANOID_V2' (same bone names, hierarchy and
    bind matrices per body) so PlayCanvas resolves skins (findByName) and anim paths on one live skeleton
  * clean names: Blender suffixes (__male/__female) are stripped while exporting and restored afterwards
  * deformable pieces keep the Armature modifier unapplied (JOINTS_0/WEIGHTS_0, max 4 influences);
    face pieces carry the facial morph targets (same names as the body)
  * rigid accessories: non-skinned mesh in the local frame of their socket (no armature in the file)
  * animation banks: one glTF animation per clip (NLA tracks), rotations + hip translation only
Paths are relative to BAR_Avatar_V2/export.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\glb_tools.py", encoding="utf-8").read())

BODIES = ("male", "female")
FOLDER = {"hair": "hair", "facial": "facial_hair", "top": "tops", "bottom": "bottoms", "footwear": "footwear", "accessory": "accessories"}
BODY_PARTS = [("BAR_Body_{B}", "BAR_Body"), ("BAR_Eyes__{b}", "BAR_Eyes"), ("BAR_Brows_regular__{b}", "BAR_Brows_regular"),
              ("BAR_Brows_thin__{b}", "BAR_Brows_thin"), ("BAR_Brows_thick__{b}", "BAR_Brows_thick")]
CLIPS = ["Idle", "Walk", "Run", "Sit", "Drink", "Dance", "Wave", "Use", "DrunkIdle", "DrunkWalk", "Fallen", "Recover",
         "Wait", "CardsSit", "AngrySit", "Pose", "OldCaneWalk", "OldCaneHold"]


class Renamer:
    """Temporarily give datablocks their exported names (unique per export), restore on exit."""

    def __init__(self):
        self.done = []

    def rename(self, idblock, new):
        if idblock.name == new:
            return
        coll = {"Object": bpy.data.objects, "Material": bpy.data.materials, "Armature": bpy.data.armatures,
                "Mesh": bpy.data.meshes, "Action": bpy.data.actions}.get(type(idblock).__name__)
        other = coll.get(new) if coll is not None else None
        if other is not None and other != idblock:
            self.done.append((other, other.name))
            other.name = new + "__parked"
        self.done.append((idblock, idblock.name))
        idblock.name = new

    def restore(self):
        for idblock, old in reversed(self.done):
            idblock.name = old
        self.done.clear()


def select_only(objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def gltf_export(path, objs, animations=False, skins=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(objs)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
              export_image_format="AUTO", export_extras=True, export_skins=skins, export_all_influences=False,
              export_def_bones=False, export_morph=True, export_morph_normal=False, export_lights=False,
              export_cameras=False, export_animations=animations)
    if animations:
        kw.update(export_animation_mode="NLA_TRACKS", export_force_sampling=False, export_frame_range=False,
                  export_anim_single_armature=True, export_reset_pose_bones=True, export_optimize_animation_size=False)
    bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def sockets_of(rig):
    return [o for o in rig.children if o.type == "EMPTY" and "bar_socket" in o.keys()]


def prepare_rig(rig, r: Renamer):
    r.rename(rig, RIG_ID)
    r.rename(rig.data, RIG_ID)
    for s in sockets_of(rig):
        r.rename(s, s["bar_socket"])
    rig.animation_data_create()
    rig.animation_data.action = None
    for t in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(t)
    rig.location = (0, 0, 0)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def clean_names(objs, r: Renamer):
    for o in objs:
        r.rename(o.data, o.name)  # glTF mesh names follow the clean node name
        for m in o.data.materials:
            if m and "__" in m.name:
                r.rename(m, m.name.split("__")[0])


def reset_shape_keys(objs):
    for o in objs:
        if o.type == "MESH" and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks[1:]:
                k.value = 0.0


def catalogue(body):
    out = []
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.endswith(f"__{body}"):
            piece = o.name[: -len(body) - 2]
            cat = piece.split("_")[0]
            if cat in FOLDER:
                out.append((piece, cat, o))
    return sorted(out)


def export_rigid(piece, ob, rig, body, r: Renamer):
    """Accessory as a plain mesh in its socket's frame (rest pose: identity rotation, socket at origin)."""
    sock = next(s for s in sockets_of(rig) if s["bar_socket"] == ob["bar_socket"])
    bpy.context.view_layer.update()
    origin = rig.matrix_world.inverted() @ sock.matrix_world.translation
    me = ob.data.copy()
    me.vertices.foreach_set("co", (mesh_arrays(me) - np.array(origin)).ravel())
    me.update()
    tmp = bpy.data.objects.new(f"_tmp_{piece}", me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp["bar_socket"] = ob["bar_socket"]
    tmp["bar_attachment"] = "socket"
    try:
        r.rename(tmp, piece)
        clean_names([tmp], r)
        p = os.path.join(EXPORT, FOLDER["accessory"], f"{piece}_{body}.glb")
        size = gltf_export(p, [tmp], skins=False)
    finally:
        r.restore()
        bpy.data.objects.remove(tmp, do_unlink=True)
        bpy.data.meshes.remove(me)
    return p, size


def export_all(only=None):
    results = []
    for body in BODIES:
        rig = bpy.data.objects[f"RIG_{body}"]
        saved_loc = rig.location.copy()
        items = catalogue(body)
        reset_shape_keys([o for _, _, o in items] + [bpy.data.objects[s.format(B=body.capitalize(), b=body)] for s, _ in BODY_PARTS])
        for piece, cat, ob in items:  # rigid accessories first: they do not need the rig renamed
            if cat == "accessory" and (not only or piece in only):
                p, size = export_rigid(piece, ob, rig, body, Renamer())
                results.append(("rigid", body, p, size))
        r = Renamer()
        try:
            prepare_rig(rig, r)
            socks = sockets_of(rig)
            if not only or "rig" in only:
                p = os.path.join(EXPORT, "rigs", f"bar_humanoid_v2_{body}.glb")
                results.append(("rig", body, p, gltf_export(p, [rig] + socks)))
            if not only or "body" in only:
                parts = []
                for src, dst in BODY_PARTS:
                    ob = bpy.data.objects[src.format(B=body.capitalize(), b=body)]
                    r.rename(ob, dst)
                    parts.append(ob)
                clean_names(parts, r)
                p = os.path.join(EXPORT, "bodies", f"{body}.glb")
                results.append(("body", body, p, gltf_export(p, [rig] + socks + parts)))
            for piece, cat, ob in items:
                if cat == "accessory" or (only and piece not in only):
                    continue
                r.rename(ob, piece)
                clean_names([ob], r)
                p = os.path.join(EXPORT, FOLDER[cat], f"{piece}_{body}.glb")
                results.append(("piece", body, p, gltf_export(p, [rig, ob])))
            if not only or "animations" in only:
                ad = rig.animation_data
                for clip in CLIPS:
                    act = bpy.data.actions[f"{clip}__{body}"]
                    tr = ad.nla_tracks.new()
                    tr.name = clip
                    st = tr.strips.new(clip, 0, act)
                    st.name = clip
                ad.action = None
                p = os.path.join(EXPORT, "animations", f"humanoid_v2_{body}.glb")
                gltf_export(p, [rig], animations=True)
                removed = keep_rotation_and_root_motion(p)
                print(f"animations {body}: removed {removed} translation/scale channels (bone lengths stay per body)")
                b, a = reduce_keyframes(p)
                print(f"animations {body}: keyframes {b} -> {a} (tolerance 0.1 deg / 0.3 mm)")
                results.append(("animations", body, p, os.path.getsize(p)))
                for t in list(ad.nla_tracks):
                    ad.nla_tracks.remove(t)
        finally:
            r.restore()
            rig.location = saved_loc
    # shared textures: one external file instead of a copy inside every hair/facial/body GLB
    shared = {"hair_v2": "hair_v2.png", "eye_v2": "eye_v2.png"}
    final = []
    for kind, body, p, size in results:
        if externalize_images(p, shared):
            size = os.path.getsize(p)
        final.append((kind, body, p, size))
    for kind, body, p, size in final:
        print(f"{kind:10s} {body:6s} {os.path.relpath(p, EXPORT)}  {size / 1024:.1f} KiB")
    return final


if __name__ == "__main__" or True:
    EXPORTED = export_all()
