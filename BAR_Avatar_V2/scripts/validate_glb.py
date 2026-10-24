"""Independent GLB validation of the whole BAR Avatar V2 export. Run headless, outside the authoring session:

  blender.exe -b --factory-startup --python validate_glb.py -- <export_dir> <report.json>

1. raw glTF checks (JSON + binary accessors) for every GLB: hierarchy, skins, weights, bind matrices,
   materials, images (embedded or relative external), animation channels, morph targets, absolute paths
2. cross-file contract per body: identical joint names, joint paths and inverse bind matrices
3. Blender re-import in an empty factory scene: body, every deformable piece re-bound by bone NAME to the
   body skeleton (single armature), rigid accessories parented to their socket, all clips of the bank
   compared with the master (reference_poses.json), morph targets, validation renders.
"""
import json
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
EXPORT = argv[0] if argv else r"C:\Users\rafael\BAR_Avatar_V2\export"
REPORT = argv[1] if len(argv) > 1 else os.path.join(EXPORT, "validation", "validation-report.json")
RENDER_DIR = os.path.join(os.path.dirname(EXPORT), "renders", "validation")
os.makedirs(RENDER_DIR, exist_ok=True)
DEFORMABLE = ["hair", "facial_hair", "tops", "bottoms", "footwear"]
TOL_POSE = 0.003   # m (keyframe reduction keeps <= 0.1 deg per joint)
TOL_ACC = 0.003    # m

CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    b = open(path, "rb").read()
    magic, ver, length = struct.unpack_from("<III", b, 0)
    assert magic == 0x46546C67 and ver == 2 and length == len(b), "bad GLB header"
    jlen = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    bin_ = b""
    if off < len(b):
        blen = struct.unpack_from("<I", b, off)[0]
        bin_ = b[off + 8:off + 8 + blen]
    return js, bin_


def _read(bin_, view, byte_offset, count, fmt, size, n):
    stride = view.get("byteStride", size * n)
    base = view.get("byteOffset", 0) + byte_offset
    if base + (count - 1) * stride + size * n > len(bin_):
        raise ValueError("accessor reads past the binary chunk")
    return np.array([struct.unpack_from("<" + fmt * n, bin_, base + k * stride) for k in range(count)], float).reshape(count, n)


def accessor(js, bin_, i):
    """Dense or sparse accessor -> (count, components) float array (sparse = glTF 2.0 3.6.2.3)."""
    a = js["accessors"][i]
    fmt, size = CT[a["componentType"]]
    n = NC[a["type"]]
    if "bufferView" in a:
        out = _read(bin_, js["bufferViews"][a["bufferView"]], a.get("byteOffset", 0), a["count"], fmt, size, n)
    else:
        out = np.zeros((a["count"], n))
    if "sparse" in a:
        sp = a["sparse"]
        ifmt, isize = CT[sp["indices"]["componentType"]]
        idx = _read(bin_, js["bufferViews"][sp["indices"]["bufferView"]], sp["indices"].get("byteOffset", 0), sp["count"], ifmt, isize, 1)
        val = _read(bin_, js["bufferViews"][sp["values"]["bufferView"]], sp["values"].get("byteOffset", 0), sp["count"], fmt, size, n)
        out[idx[:, 0].astype(int)] = val
    if a.get("normalized"):
        out /= {5121: 255.0, 5123: 65535.0}[a["componentType"]]
    return out


def node_paths(js):
    parent = {}
    for i, n in enumerate(js["nodes"]):
        for c in n.get("children", []):
            parent[c] = i

    def path(i):
        p = []
        while i is not None:
            p.insert(0, js["nodes"][i].get("name", f"#{i}"))
            i = parent.get(i)
        return "/".join(p)
    return {i: path(i) for i in range(len(js["nodes"]))}


def rel(p):
    return os.path.relpath(p, EXPORT).replace("\\", "/")


def raw_check(path):
    js, bin_ = read_glb(path)
    r = {"file": rel(path), "size_bytes": os.path.getsize(path), "errors": [], "warnings": []}
    paths = node_paths(js)
    names = [n.get("name") for n in js["nodes"]]
    r["generator"] = js["asset"].get("generator")
    r["nodes"] = len(names)
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        r["errors"].append(f"duplicate node names: {sorted(dup)}")
    r["skins"] = []
    for s in js.get("skins", []):
        joints = [names[j] for j in s["joints"]]
        ibm = accessor(js, bin_, s["inverseBindMatrices"]) if "inverseBindMatrices" in s else None
        r["skins"].append({"joints": len(joints), "joint_names": joints,
                           "ibm": {joints[k]: [round(x, 6) for x in ibm[k]] for k in range(len(joints))} if ibm is not None else None,
                           "joint_paths": {names[j]: paths[j] for j in s["joints"]}})
    r["meshes"] = []
    tris_total = 0
    for n in js["nodes"]:
        if "mesh" not in n:
            continue
        m = js["meshes"][n["mesh"]]
        info = {"node": n.get("name"), "skinned": "skin" in n, "primitives": [], "extras": n.get("extras", {}),
                "morph_targets": m.get("extras", {}).get("targetNames", [])}
        for p in m["primitives"]:
            cnt = js["accessors"][p["indices"]]["count"] if "indices" in p else js["accessors"][p["attributes"]["POSITION"]]["count"]
            tris_total += cnt // 3
            pi = {"attributes": sorted(p["attributes"]), "triangles": cnt // 3,
                  "vertices": js["accessors"][p["attributes"]["POSITION"]]["count"],
                  "material": js["materials"][p["material"]]["name"] if "material" in p else None,
                  "morph_targets": len(p.get("targets", []))}
            if "skin" in n:
                W = accessor(js, bin_, p["attributes"]["WEIGHTS_0"])
                Jn = accessor(js, bin_, p["attributes"]["JOINTS_0"])
                s = W.sum(1)
                pi.update(weights_sum_min=round(float(s.min()), 4), weights_sum_max=round(float(s.max()), 4),
                          influences_max=int((W > 1e-6).sum(1).max()), unweighted_vertices=int((s < 1e-4).sum()))
                if Jn.max() >= len(js["skins"][n["skin"]]["joints"]):
                    r["errors"].append(f"{n.get('name')}: joint index out of range")
                if abs(s.min() - 1) > 0.01 or abs(s.max() - 1) > 0.01:
                    r["errors"].append(f"{n.get('name')}: weights not normalised ({s.min():.3f}..{s.max():.3f})")
                if pi["unweighted_vertices"]:
                    r["errors"].append(f"{n.get('name')}: {pi['unweighted_vertices']} unweighted vertices")
            P = accessor(js, bin_, p["attributes"]["POSITION"])
            if not np.isfinite(P).all():
                r["errors"].append(f"{n.get('name')}: non finite positions")
            for ti, tgt in enumerate(p.get("targets", [])):
                try:
                    D = accessor(js, bin_, tgt["POSITION"])
                    if D.shape[0] != P.shape[0] or not np.isfinite(D).all():
                        r["errors"].append(f"{n.get('name')}: morph target {ti} has a bad size or values")
                    pi.setdefault("morph_max_delta_m", [])
                    pi["morph_max_delta_m"].append(round(float(np.linalg.norm(D, axis=1).max()), 4))
                except Exception as e:  # corrupted (e.g. sparse views not remapped)
                    r["errors"].append(f"{n.get('name')}: morph target {ti} unreadable: {e}")
            info["primitives"].append(pi)
        r["meshes"].append(info)
    r["triangles_total"] = tris_total
    r["materials"] = [{"name": m.get("name"), "doubleSided": m.get("doubleSided", False), "alphaMode": m.get("alphaMode", "OPAQUE"),
                       "baseColorTexture": "baseColorTexture" in m.get("pbrMetallicRoughness", {}),
                       "baseColorFactor": m.get("pbrMetallicRoughness", {}).get("baseColorFactor"),
                       "metallic": m.get("pbrMetallicRoughness", {}).get("metallicFactor", 1.0)} for m in js.get("materials", [])]
    r["images"] = []
    for im in js.get("images", []):
        e = {"name": im.get("name"), "embedded": "bufferView" in im, "uri": im.get("uri"), "mimeType": im.get("mimeType")}
        if not e["embedded"]:
            uri = im.get("uri", "")
            target = os.path.normpath(os.path.join(os.path.dirname(path), uri))
            e["external_exists"] = os.path.isfile(target)
            if os.path.isabs(uri) or ":" in uri or not e["external_exists"]:
                r["errors"].append(f"image {im.get('name')}: external uri '{uri}' is absolute or missing")
        r["images"].append(e)
    r["animations"] = []
    for a in js.get("animations", []):
        tgt = {}
        tmax = 0.0
        keys = 0
        for ch in a["channels"]:
            tgt.setdefault(ch["target"]["path"], set()).add(names[ch["target"]["node"]])
            inp = js["accessors"][a["samplers"][ch["sampler"]]["input"]]
            tmax = max(tmax, inp.get("max", [0])[0])
            keys += inp["count"]
        info = {"name": a.get("name"), "channels": len(a["channels"]), "keys": keys, "duration_s": round(tmax, 4),
                "rotation_targets": len(tgt.get("rotation", [])), "translation_targets": sorted(tgt.get("translation", [])),
                "scale_targets": sorted(tgt.get("scale", []))}
        if set(info["translation_targets"]) - {"hip"}:
            r["errors"].append(f"animation {a.get('name')}: translation keys on {info['translation_targets']}")
        if info["scale_targets"]:
            r["errors"].append(f"animation {a.get('name')}: scale channels present")
        r["animations"].append(info)
    raw = json.dumps(js)
    if ":\\\\" in raw or "C:/" in raw or "/Users/" in raw:
        r["errors"].append("absolute path found in glTF JSON")
    return r


def material_check(raw, ref):
    """Every mesh node uses exactly the materials its master object uses (catches lost material slots)."""
    out = {"checked_nodes": 0, "errors": []}
    for r in raw:
        body = next((b for b in ("male", "female") if r["file"].endswith((f"_{b}.glb", f"/{b}.glb"))), None)
        exp = ref["poses"][body].get("materials", {}) if body else {}
        for m in r["meshes"]:
            if m["node"] not in exp:
                continue
            got = sorted({p["material"] for p in m["primitives"]})
            out["checked_nodes"] += 1
            if got != exp[m["node"]]:
                out["errors"].append(f"{r['file']}:{m['node']}: materials {got} != master {exp[m['node']]}")
    return out


def cross_check(reports):
    out = {}
    for body in ("male", "female"):
        rel_ = [r for r in reports if r["file"].endswith(f"_{body}.glb") or r["file"].endswith(f"/{body}.glb")]
        ref = None
        res = {"files": [], "errors": []}
        for r in rel_:
            for s in r["skins"]:
                if ref is None:
                    ref = (r["file"], s)
                    continue
                worst = 0.0
                for j in set(s["joint_names"]) & set(ref[1]["joint_names"]):
                    worst = max(worst, max(abs(a - b) for a, b in zip(s["ibm"][j], ref[1]["ibm"][j])))
                    if s["joint_paths"][j] != ref[1]["joint_paths"][j]:
                        res["errors"].append(f"{r['file']}: joint path differs for {j}")
                missing = set(ref[1]["joint_names"]) - set(s["joint_names"])
                res["files"].append({"file": r["file"], "joints": len(s["joint_names"]), "ibm_max_abs_diff": round(worst, 7),
                                     "missing_vs_reference": sorted(missing),
                                     "same_joint_order": s["joint_names"] == ref[1]["joint_names"]})  # needed to share one Skin
                if worst > 1e-4:
                    res["errors"].append(f"{r['file']}: inverse bind matrices differ from {ref[0]} (max {worst})")
                if missing:
                    res["errors"].append(f"{r['file']}: joints missing {sorted(missing)}")
        res["reference"] = ref[0] if ref else None
        res["skinned_files_checked"] = len(res["files"]) + (1 if ref else 0)
        out[body] = res
    return out


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def mesh_nodes(path):
    js, _ = read_glb(path)
    return {n["name"] for n in js["nodes"] if "mesh" in n}


def blender_reimport(body, ref):
    res = {"body": body, "errors": [], "checks": {}}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = ref["fps"]  # the importer converts seconds to frames with the scene rate
    body_path = os.path.join(EXPORT, "bodies", f"{body}.glb")
    objs = import_glb(body_path)
    arm = next(o for o in objs if o.type == "ARMATURE")
    real = mesh_nodes(body_path)
    meshes = [o for o in objs if o.type == "MESH" and o.name in real]
    res["checks"]["armature_name"] = arm.name
    res["checks"]["bones"] = len(arm.data.bones)
    res["checks"]["body_meshes"] = sorted(o.name for o in meshes)
    res["checks"]["importer_helper_objects_ignored"] = sorted(o.name for o in objs if o.type == "MESH" and o.name not in real)
    sockets = {o.name: o for o in objs if o.type == "EMPTY" and o.name.startswith("socket_")}
    res["checks"]["sockets"] = sorted(sockets)
    for o in meshes:
        mod = next((m for m in o.modifiers if m.type == "ARMATURE"), None)
        if mod is None or mod.object != arm:
            res["errors"].append(f"{o.name}: not bound to the body armature after import")
    exp_morph = ref["poses"][body]["morph_targets"]
    morph = {}
    for o in meshes:
        if o.data.shape_keys:
            morph[o.name] = [k.name for k in o.data.shape_keys.key_blocks[1:]]
    if morph.get("BAR_Body") != exp_morph.get("BAR_Body"):
        res["errors"].append(f"body morph targets differ: {morph.get('BAR_Body')} vs {exp_morph.get('BAR_Body')}")
    res["checks"]["body_morph_targets"] = morph.get("BAR_Body")
    # every deformable piece on the single body skeleton
    assembled, piece_checks = [], {}
    for folder in DEFORMABLE:
        d = os.path.join(EXPORT, folder)
        for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if not fn.endswith(f"_{body}.glb"):
                continue
            pid = fn[: -len(f"_{body}.glb")]
            new = import_glb(os.path.join(d, fn))
            parm = next(o for o in new if o.type == "ARMATURE")
            pm = next(o for o in new if o.type == "MESH" and o.name.split(".")[0] == pid)
            missing = [g.name for g in pm.vertex_groups if g.name not in arm.data.bones]
            worst = 0.0
            for g in pm.vertex_groups:
                if g.name in arm.data.bones:
                    worst = max(worst, (parm.matrix_world @ parm.data.bones[g.name].head_local - arm.matrix_world @ arm.data.bones[g.name].head_local).length)
            mw = pm.matrix_world.copy()
            pm.parent = arm
            pm.matrix_world = mw
            for m in pm.modifiers:
                if m.type == "ARMATURE":
                    m.object = arm
            for o in new:
                if o != pm:
                    bpy.data.objects.remove(o, do_unlink=True)
            pc = {"vertex_groups": len(pm.vertex_groups), "rest_joint_max_diff_m": round(worst, 6),
                  "morph_targets": [k.name for k in pm.data.shape_keys.key_blocks[1:]] if pm.data.shape_keys else []}
            if missing:
                res["errors"].append(f"{pid}: vertex groups without bone in body skeleton: {missing}")
            if worst > 1e-4:
                res["errors"].append(f"{pid}: rest joints differ from body ({worst:.6f} m)")
            if pid in exp_morph and pc["morph_targets"] != exp_morph[pid]:
                res["errors"].append(f"{pid}: morph targets differ from master")
            piece_checks[pid] = pc
            pm.name = pid
            assembled.append(pid)
    res["checks"]["pieces"] = piece_checks
    res["checks"]["assembled_on_single_skeleton"] = len(assembled)
    res["checks"]["armatures_in_scene"] = len([o for o in bpy.data.objects if o.type == "ARMATURE"])
    if res["checks"]["armatures_in_scene"] != 1:
        res["errors"].append("more than one armature after assembly")
    # rigid accessories on their sockets
    accs = {}
    d = os.path.join(EXPORT, "accessories")
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(f"_{body}.glb"):
            continue
        pid = fn[: -len(f"_{body}.glb")]
        new = import_glb(os.path.join(d, fn))
        am = next(o for o in new if o.type == "MESH" and o.name.split(".")[0] == pid)
        sock = am.get("bar_socket")
        if sock not in sockets:
            res["errors"].append(f"{pid}: socket '{sock}' missing on the body")
            continue
        am.parent = sockets[sock]
        am.matrix_parent_inverse.identity()
        am.location, am.rotation_quaternion, am.rotation_euler = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0)
        am.name = pid
        accs[pid] = am
    # animation bank on the same skeleton
    new = import_glb(os.path.join(EXPORT, "animations", f"humanoid_v2_{body}.glb"))
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    acts = {a.name.split("_BAR_HUMANOID")[0]: a for a in bpy.data.actions}
    arm.animation_data_create()
    scene = bpy.context.scene
    pose_err = {}
    for clip in ref["clips"]:
        act = acts.get(clip)
        if act is None:
            res["errors"].append(f"clip {clip} missing after import")
            continue
        arm.animation_data.action = act
        worst = 0.0
        for f, joints in ref["poses"][body][clip]["samples"].items():
            scene.frame_set(int(f))
            for j, p in joints.items():
                worst = max(worst, (arm.matrix_world @ arm.pose.bones[j].head - Vector(p)).length)
        # round: the importer may return a frame_range end like 124.999 for a 126-frame clip
        pose_err[clip] = {"frames": int(round(act.frame_range[1])) + 1, "expected_frames": ref["poses"][body][clip]["frames"],
                          "max_joint_error_m": round(worst, 6)}
        if worst > TOL_POSE or pose_err[clip]["frames"] != pose_err[clip]["expected_frames"]:
            res["errors"].append(f"{clip}: reimported clip differs from master (pose {worst:.4f} m, frames {pose_err[clip]['frames']})")
    res["checks"]["animation_roundtrip"] = pose_err
    acc_err = {}
    for pid, am in accs.items():
        worst = 0.0
        per = {}
        for key, c in ref["poses"][body]["accessories"].get(pid, {}).items():
            clip, f = key.split(":")
            if clip == "rest":
                arm.animation_data.action = None
                for pb in arm.pose.bones:
                    pb.rotation_quaternion = (1, 0, 0, 0)
                    pb.location = (0, 0, 0)
            else:
                arm.animation_data.action = acts[clip]
            scene.frame_set(int(f))
            bpy.context.view_layer.update()
            pts = np.array([tuple(am.matrix_world @ v.co) for v in am.data.vertices])
            cen = (pts.min(0) + pts.max(0)) / 2  # bbox centre: glTF export splits vertices at seams
            e = float(np.linalg.norm(cen - np.array(c)))
            per[key] = round(e, 6)
            worst = max(worst, e)
        acc_err[pid] = {"socket": am.parent.name if am.parent else None, "max_center_error_m": round(worst, 6), "per_pose": per}
        if worst > TOL_ACC:
            res["errors"].append(f"{pid}: attached accessory differs from master by {worst:.4f} m")
    res["checks"]["accessories_on_sockets"] = acc_err
    try:
        region_names = json.load(open(os.path.join(os.path.dirname(EXPORT), "source", "cache", "body_regions.json")))["regions"]
        res["checks"]["renders"] = render_views(arm, body, acts, assembled, accs, res, region_names)
    except Exception as e:
        import traceback
        res["errors"].append(f"render/variant/region checks failed: {e}")
        res["checks"]["renders"] = traceback.format_exc()
    return res


OUTFITS = {"male": ["hair_short", "top_shirt", "bottom_jeans", "footwear_shoes", "accessory_glasses", "facial_mustache"],
           "female": ["hair_long", "top_tank", "bottom_skirt", "footwear_flipflops", "accessory_bracelet"]}
# second outfit: texture-only variants applied the way the game will (swap the baseColor image of the shared mesh)
VARIANT_OUTFITS = {"male": ["hair_parted", "top_tee", "bottom_jeans", "footwear_sneakers", "accessory_hat", "facial_beard_short"],
                   "female": ["hair_ponytail", "top_tee", "bottom_jeans", "footwear_sneakers", "accessory_sunglasses"]}
TEXTURE_VARIANTS = {"top_tee_print": "top_tee", "bottom_pants": "bottom_jeans"}
VIEWS = (("Idle", 30, (1.2, -4.0, 1.0)), ("Walk", 7, (3.2, -2.6, 1.0)), ("Dance", 200, (-3.0, -2.8, 1.0)), ("Sit", 60, (2.5, -3.2, 0.9)))


def apply_texture_variants(body, res):
    """Replace the baseColor image of each variant's base piece with textures/<variant>_<body>.png."""
    out = {}
    for variant, base in TEXTURE_VARIANTS.items():
        ob = bpy.data.objects.get(base)
        path = os.path.join(EXPORT, "textures", f"{variant}_{body}.png")
        mat, tex = next(((m, n) for m in (ob.data.materials if ob else []) if m and m.use_nodes
                         for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), (None, None))
        if tex is None or not os.path.exists(path):
            res["errors"].append(f"texture variant {variant}: base image or override file missing")
            continue
        old = tex.image
        new = bpy.data.images.load(path)
        out[variant] = {"base_piece": base, "material": mat.name, "base_image": old.name,
                        "base_image_size": list(old.size), "override_size": list(new.size), "override": f"textures/{variant}_{body}.png"}
        if tuple(old.size) != tuple(new.size):
            res["errors"].append(f"texture variant {variant}: size {tuple(new.size)} differs from base {tuple(old.size)}")
        tex.image = new
    return out


def body_regions(body_ob):
    """Region id per polygon from TEXCOORD_1 (u = (id + 0.5) / 32), as the game will read it."""
    uv = body_ob.data.uv_layers[1].data
    return [int(uv[p.loop_start].uv[0] * 32) for p in body_ob.data.polygons]


def hide_regions(body_ob, regions, hidden):
    """Emulate the in-game alpha-test mask: drop every face whose region is hidden by the worn pieces."""
    import bmesh
    me = body_ob.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if regions[f.index] in hidden], context="FACES_ONLY")
    bm.to_mesh(me)
    bm.free()
    return me


def render_views(arm, body, acts, assembled, accs, res, region_names):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        return "workbench unavailable"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 640, 900
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    body_ob = bpy.data.objects["BAR_Body"]
    regions = body_regions(body_ob)
    full_mesh = body_ob.data
    out = {"outfit": OUTFITS[body], "variant_outfit": VARIANT_OUTFITS[body], "files": []}

    def shoot(outfit, tag, views, hidden=()):
        keep = set(outfit) | {"BAR_Body", "BAR_Eyes", "BAR_Brows_regular"}
        for o in bpy.data.objects:
            if o.type == "MESH":
                o.hide_render = o.name.split(".")[0] not in keep
        if hidden:
            body_ob.data = hide_regions(body_ob, regions, hidden)
        for clip, f, pos in views:
            arm.animation_data.action = acts.get(clip)
            scene.frame_set(f)
            cam.location = pos
            cam.rotation_euler = (Vector((0, 0, 0.85)) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
            p = os.path.join(RENDER_DIR, f"reimport_{body}_{tag}{clip}_{f:03d}.png")
            scene.render.filepath = p
            bpy.ops.render.render(write_still=True)
            out["files"].append(os.path.relpath(p, os.path.dirname(EXPORT)).replace("\\", "/"))
        body_ob.data = full_mesh

    def hidden_by(outfit):
        ids = set()
        for pid in outfit:
            ob = bpy.data.objects.get(pid)
            for name in filter(None, str(ob.get("bar_hides", "")).split(",")) if ob else ():
                if name not in region_names:
                    res["errors"].append(f"{pid}: bar_hides names unknown region '{name}'")
                else:
                    ids.add(region_names.index(name))
        # 'waist' is hidden only when a top and a bottom are worn together (rig-contract regionRules)
        if any(p.startswith("top_") for p in outfit) and any(p.startswith("bottom_") for p in outfit):
            ids.add(region_names.index("waist"))
        return ids

    shoot(OUTFITS[body], "", VIEWS)  # full body under the clothes (worst case: shows any skin poking through)
    shoot(OUTFITS[body], "masked_", VIEWS, hidden_by(OUTFITS[body]))  # as in game: covered regions hidden
    out["texture_variants"] = apply_texture_variants(body, res)
    shoot(VARIANT_OUTFITS[body], "variant_masked_", VIEWS[:1] + VIEWS[2:3], hidden_by(VARIANT_OUTFITS[body]))
    out["region_ids_present"] = sorted(set(regions))
    return out


def main():
    files = sorted(os.path.join(r, f) for r, _, fs in os.walk(EXPORT) for f in fs if f.endswith(".glb"))
    raw = [raw_check(p) for p in files]
    cross = cross_check(raw)
    ref = json.load(open(os.path.join(EXPORT, "validation", "reference_poses.json")))
    mats = material_check(raw, ref)
    reimport = {}
    for body in ("male", "female"):
        try:
            reimport[body] = blender_reimport(body, ref)
        except Exception as e:
            import traceback
            reimport[body] = {"errors": [f"reimport failed: {e}", traceback.format_exc()]}
    for r in raw:
        for s in r["skins"]:
            s.pop("ibm", None)
            s.pop("joint_paths", None)
            s["joint_names"] = s["joint_names"][:6] + (["..."] if len(s["joint_names"]) > 6 else [])
    report = {"tool": "scripts/validate_glb.py", "blender": bpy.app.version_string, "factory_startup": True,
              "files_checked": len(raw), "raw_gltf": raw, "cross_file_skin_contract": cross, "materials_vs_master": mats, "blender_reimport": reimport,
              "errors_total": sum(len(r["errors"]) for r in raw) + sum(len(c["errors"]) for c in cross.values())
              + sum(len(v.get("errors", [])) for v in reimport.values()) + len(mats["errors"])}
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print("VALIDATION files", len(raw), "errors_total =", report["errors_total"])


main()
