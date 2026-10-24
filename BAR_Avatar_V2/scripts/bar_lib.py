"""BAR Avatar V2 - shared pipeline helpers (run inside Blender 4.0.2).

Loaded by the step scripts with exec(); keeps every repetitive operation in one place.
Source character: CharMorph "Antonia Polygon" (CC-BY 3.0, Olaf Delgado-Friedrichs et al.).
"""
import os
import json
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = r"C:\Users\rafael\BAR_Avatar_V2"
SRC = os.path.join(ROOT, "source")
CACHE = os.path.join(SRC, "cache")
EXPORT = os.path.join(ROOT, "export")
CM_ANTONIA = r"C:\Users\rafael\AppData\Roaming\Blender Foundation\Blender\4.0\scripts\addons\CharMorph\data\characters\antonia"
os.makedirs(CACHE, exist_ok=True)

RIG_ID = "BAR_HUMANOID_V2"
RIG_CONTRACT_VERSION = "2.0.0"

# Antonia material indices that form the mouth interior (teeth, gums, tongue, mouth bag).
MOUTH_INTERIOR_MATS = {4, 13, 14}


# --------------------------------------------------------------------------- npz data
def read_vg_npz(path):
    z = np.load(path)
    names = [n.decode("utf-8") for n in bytes(z["names"]).split(b"\0")]
    idx, w, cnt = z["idx"], z["weights"], z["cnt"]
    i = 0
    for name, c in zip(names, cnt):
        j = i + int(c)
        yield name, idx[i:j].astype(np.int64), w[i:j].astype(np.float64)
        i = j


def compute_joints(V):
    """Joint positions as CharMorph defines them: weighted vertex averages per joint."""
    out = {}
    for name, idx, w in read_vg_npz(os.path.join(CM_ANTONIA, "joints", "rigify.npz")):
        if not name.startswith("joint_") or w.sum() < 1e-10:
            continue
        out[name[6:]] = (V[idx] * w[:, None]).sum(0) / w.sum()
    return out


def J(joints, bone, end="head"):
    return Vector(joints[f"{bone}_{end}"])


def load_def_weights():
    """Authored Antonia skin weights: {DEF-name: (vertex idx, weights)}."""
    return {n: (i, w) for n, i, w in read_vg_npz(os.path.join(CM_ANTONIA, "weights", "rigify.npz"))
            if n.startswith("DEF-") or n.startswith("MCH-eye") or n.startswith("ORG-teeth")}


# --------------------------------------------------------------------------- mesh io
def mesh_arrays(me):
    V = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", V)
    return V.reshape(-1, 3)


def set_mesh_co(me, V):
    me.vertices.foreach_set("co", np.asarray(V, dtype=np.float64).ravel())
    me.update()


def int_array(collection, prop, width=1):
    """foreach_get for 32-bit integer properties. Passing int64 buffers to foreach_get has corrupted
    data in this Blender build (a BVH built from such indices crashed Blender), so always read int32."""
    a = np.zeros(len(collection) * width, dtype=np.int32)
    collection.foreach_get(prop, a)
    a = a.astype(np.int64)
    return a.reshape(-1, width) if width > 1 else a


def edges_array(me):
    return int_array(me.edges, "vertices", 2)


def laplacian_smooth(V, E, mask, iterations=30, factor=0.5):
    """Umbrella smoothing restricted by a per-vertex mask in [0, 1]."""
    V = V.copy()
    n = len(V)
    deg = np.bincount(E.ravel(), minlength=n).astype(np.float64)
    deg[deg == 0] = 1
    m = (mask * factor)[:, None]
    for _ in range(iterations):
        acc = np.zeros_like(V)
        np.add.at(acc, E[:, 0], V[E[:, 1]])
        np.add.at(acc, E[:, 1], V[E[:, 0]])
        avg = acc / deg[:, None]
        V += (avg - V) * m
    return V


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def seg_closest(P, a, b):
    """Closest points on segment a-b for points P (N,3); returns (points, t)."""
    a = np.asarray(a, float); b = np.asarray(b, float)
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return a + t[:, None] * ab, t


def radial_scale(V, a, b, factor, weight):
    """Scale points away from segment a-b by `factor` (1 = unchanged) blended by `weight`."""
    c, _ = seg_closest(V, a, b)
    return V + (V - c) * ((factor - 1.0) * weight)[:, None]


# --------------------------------------------------------------------------- scene utils
def ensure_collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def link_only(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def new_mesh_object(name, verts, faces, col=None):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
