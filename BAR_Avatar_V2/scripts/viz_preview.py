"""Validation helper: a copy of a body with the regions hidden by the worn pieces removed (as the game
will do with the region mask). Never exported."""
import bpy, bmesh, json, os

CACHE = r"C:\Users\rafael\BAR_Avatar_V2\source\cache"


def with_waist(hides, pieces):
    """'waist' is hidden only when a top and a bottom are worn together (s08): neither covers it alone."""
    if any(p.startswith("top_") for p in pieces) and any(p.startswith("bottom_") for p in pieces):
        return list(hides) + ["waist"]
    return list(hides)


def preview_body(body, hides, name="PREVIEW_BODY"):
    src = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    regions = json.load(open(os.path.join(CACHE, "body_regions.json")))["regions"]
    hid = {regions.index(h) for h in hides}
    old = bpy.data.objects.get(f"{name}__{body}")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = src.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    lay = bm.faces.layers.int["body_region"]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] in hid], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f"{name}__{body}", me)
    src.users_collection[0].objects.link(ob)
    ob.parent = src.parent
    # Blender 4.0 keeps vertex-group names and weights on the copied mesh: nothing to rebuild
    assert [g.name for g in ob.vertex_groups] == [g.name for g in src.vertex_groups]
    m = ob.modifiers.new("Armature", "ARMATURE")
    m.object = src.parent
    for mat in src.data.materials:
        pass
    ob.color = src.color
    ob["bar_preview"] = True
    src.hide_set(True)
    return ob
