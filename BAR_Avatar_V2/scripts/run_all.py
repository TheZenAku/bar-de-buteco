"""Rebuild every BAR Avatar V2 source object from the cached CharMorph shapes, in dependency order.

Run inside Blender with the master file open (it needs the CharMorph object 'cm_antonia' for topology/UVs;
shapes come from source/cache/*.npy produced by s01_build_shapes.py).
Each step was run individually in this order while building the library; the whole list has not been run
end to end in one call. After it: blender -b --factory-startup --python validate_glb.py -- <export> <report>,
then blender -b source/BAR_Avatar_V2_master.blend --python s25_manifests.py.
"""
import os
import time

SCRIPTS = r"C:\Users\rafael\BAR_Avatar_V2\scripts"
STEPS = ["s02_hp_skin.py", "s03_lowpoly.py", "s04_rig.py", "s05_body.py", "s06_face_parts.py", "s07a_repack_uv.py",
         "s08_regions.py", "s07_materials.py",
         # modular catalogue
         "s09_shell_pieces.py", "s10_footwear.py", "s16_catalog_shells.py", "s16b_skirt_loft.py", "s17_hair.py",
         "s18_footwear_more.py", "s19_accessories.py", "s20_face_morphs.py", "s11_piece_materials.py",
         "s21_catalog_materials.py",
         # animation, measurements, export, references
         "s12_retarget.py", "s12b_lying_ground_fix.py", "s24_compat.py", "s13_export.py", "s14_reference_poses.py",
         "s14b_anim_report.py"]
RENDERS = ["s15_render_validation.py", "s22_showcase.py", "s23_anim_contact_sheet.py", "s26_catalog_sheets.py"]


def clean_previews():
    import bpy
    for o in list(bpy.data.objects):
        if o.name.startswith(("PREVIEW_", "LOOK_")):
            bpy.data.objects.remove(o, do_unlink=True)


def purge_orphans():
    import bpy
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(coll):
            if d.users == 0 and not d.use_fake_user:
                coll.remove(d)


def run(steps=STEPS):
    clean_previews()
    for s in steps:
        t = time.time()
        exec(open(os.path.join(SCRIPTS, s), encoding="utf-8").read(), {"__name__": "__main__"})
        print(f"[run_all] {s} {time.time() - t:.1f}s")
    purge_orphans()


run()
