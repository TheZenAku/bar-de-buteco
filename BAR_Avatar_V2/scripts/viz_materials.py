"""Validation-only preview materials that emulate the in-game tint-mask shading (never exported).

skin    : rgb * mix(outfitColor, skinTone, a)
eyes    : rgb * mix(white, eyeColor, a)
hair    : rgb * hairColor
clothing: rgb * mix(white, pieceColor, a)
"""
import bpy


def hex_lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def pv_material(src, tint, fixed):
    name = f"PV_{src.name}"
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    src_tex = next((n for n in src.node_tree.nodes if n.type == "TEX_IMAGE"), None)
    src_bsdf = next(n for n in src.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = src_bsdf.inputs["Roughness"].default_value
    if src_tex is None:  # flat accessories (no texture): the colour replaces the albedo, as in game
        bsdf.inputs["Base Color"].default_value = tint
        bsdf.inputs["Metallic"].default_value = src_bsdf.inputs["Metallic"].default_value
        mat.use_backface_culling = src.use_backface_culling
        return mat
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = src_tex.image
    mixc = nt.nodes.new("ShaderNodeMix")
    mixc.data_type = "RGBA"
    nt.links.new(tex.outputs["Alpha"], mixc.inputs[0])
    mixc.inputs[6].default_value = fixed
    mixc.inputs[7].default_value = tint
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mul.inputs[6])
    nt.links.new(mixc.outputs[2], mul.inputs[7])
    nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    mat.use_backface_culling = src.use_backface_culling
    return mat


def apply_preview(cfg):
    restore_preview()
    cache = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH" or not ob.data.materials:
            continue
        src = ob.data.materials[0]
        if src is None or src.name.startswith("PV_"):
            continue
        n = src.name
        if n not in cache:
            if n.startswith("CharacterSkin"):
                cache[n] = pv_material(src, hex_lin(cfg["skinTone"]), hex_lin(cfg["outfitColor"]))
            elif n == "CharacterEyes":
                cache[n] = pv_material(src, hex_lin(cfg["eyeColor"]), (1, 1, 1, 1))
            elif n == "CharacterHair":
                cache[n] = pv_material(src, hex_lin(cfg["hairColor"]), hex_lin(cfg["hairColor"]))
            elif n.startswith("CharacterClothing-"):
                piece = n.split("-", 1)[1].split("__")[0]
                cache[n] = pv_material(src, hex_lin(cfg["colors"].get(piece, "#888888")), (1, 1, 1, 1))
            else:
                continue
        ob["bar_pv_src"] = src.name
        ob.data.materials[0] = cache[n]


def restore_preview():
    for ob in bpy.data.objects:
        if "bar_pv_src" in ob.keys():
            ob.data.materials[0] = bpy.data.materials[ob["bar_pv_src"]]
            del ob["bar_pv_src"]
    for m in list(bpy.data.materials):
        if m.name.startswith("PV_"):
            bpy.data.materials.remove(m)


DEFAULT_CFG = {"skinTone": "#cf936d", "outfitColor": "#24363d", "hairColor": "#493126", "eyeColor": "#567a45",
               "colors": {"top_tee": "#385d86", "bottom_jeans": "#3b4a66", "footwear_sneakers": "#873e37"}}
