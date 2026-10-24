"""Minimal GLB rewrite helpers (pure Python): read, filter animation channels, compact the binary buffer."""
import json
import struct


def read_glb(path):
    b = open(path, "rb").read()
    jlen = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from("<I", b, off)[0]
    return js, bytearray(b[off + 8:off + 8 + blen])


def write_glb(path, js, bin_):
    js["buffers"] = [{"byteLength": len(bin_)}]
    text = json.dumps(js, separators=(",", ":")).encode("utf-8")
    text += b" " * ((4 - len(text) % 4) % 4)
    bin_ = bytes(bin_) + b"\0" * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(text) + 8 + len(bin_)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(text), 0x4E4F534A))
        fh.write(text)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942))
        fh.write(bin_)


def compact(js, bin_):
    """Drop accessors/bufferViews nobody references and rebuild the binary chunk."""
    used_acc = set()
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            used_acc.update(p["attributes"].values())
            if "indices" in p:
                used_acc.add(p["indices"])
            for t in p.get("targets", []):
                used_acc.update(t.values())
    for s in js.get("skins", []):
        if "inverseBindMatrices" in s:
            used_acc.add(s["inverseBindMatrices"])
    for a in js.get("animations", []):
        for s in a["samplers"]:
            used_acc.update((s["input"], s["output"]))
    acc_map = {}
    new_acc = []
    for i, a in enumerate(js.get("accessors", [])):
        if i in used_acc:
            acc_map[i] = len(new_acc)
            new_acc.append(a)
    used_bv = {a["bufferView"] for a in new_acc if "bufferView" in a}
    for a in new_acc:  # sparse accessors (Blender writes morph targets this way) reference two more views
        if "sparse" in a:
            used_bv.add(a["sparse"]["indices"]["bufferView"])
            used_bv.add(a["sparse"]["values"]["bufferView"])
    used_bv.update(im["bufferView"] for im in js.get("images", []) if "bufferView" in im)
    bv_map = {}
    new_bv = []
    out = bytearray()
    for i, v in enumerate(js.get("bufferViews", [])):
        if i not in used_bv:
            continue
        start = v.get("byteOffset", 0)
        chunk = bin_[start:start + v["byteLength"]]
        out += b"\0" * ((4 - len(out) % 4) % 4)
        nv = dict(v)
        nv["byteOffset"] = len(out)
        out += chunk
        bv_map[i] = len(new_bv)
        new_bv.append(nv)
    for a in new_acc:
        if "bufferView" in a:
            a["bufferView"] = bv_map[a["bufferView"]]
        if "sparse" in a:
            a["sparse"]["indices"]["bufferView"] = bv_map[a["sparse"]["indices"]["bufferView"]]
            a["sparse"]["values"]["bufferView"] = bv_map[a["sparse"]["values"]["bufferView"]]
    for im in js.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = bv_map[im["bufferView"]]
    js["accessors"] = new_acc
    js["bufferViews"] = new_bv
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            p["attributes"] = {k: acc_map[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = acc_map[p["indices"]]
            if "targets" in p:
                p["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in p["targets"]]
    for s in js.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = acc_map[s["inverseBindMatrices"]]
    for a in js.get("animations", []):
        for s in a["samplers"]:
            s["input"] = acc_map[s["input"]]
            s["output"] = acc_map[s["output"]]
    return js, out


import math
import struct as _struct


def _read_floats(js, bin_, idx, width):
    a = js["accessors"][idx]
    v = js["bufferViews"][a["bufferView"]]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", 4 * width)
    out = []
    for k in range(a["count"]):
        out.append(_struct.unpack_from("<" + "f" * width, bin_, start + k * stride))
    return out


def _append_floats(js, bin_, rows, width, minmax=False):
    while len(bin_) % 4:
        bin_.append(0)
    data = b"".join(_struct.pack("<" + "f" * width, *r) for r in rows)
    view = len(js["bufferViews"])
    js["bufferViews"].append({"buffer": 0, "byteOffset": len(bin_), "byteLength": len(data)})
    bin_ += data
    acc = {"bufferView": view, "componentType": 5126, "count": len(rows), "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[width]}
    if minmax:
        acc["min"] = [min(r[i] for r in rows) for i in range(width)]
        acc["max"] = [max(r[i] for r in rows) for i in range(width)]
    js["accessors"].append(acc)
    return len(js["accessors"]) - 1


def _quat_angle(a, b):
    d = abs(sum(x * y for x, y in zip(a, b)))
    return math.degrees(2 * math.acos(min(1.0, d)))


def _nlerp(a, b, t):
    if sum(x * y for x, y in zip(a, b)) < 0:
        b = [-x for x in b]
    q = [x + (y - x) * t for x, y in zip(a, b)]
    n = math.sqrt(sum(x * x for x in q)) or 1.0
    return [x / n for x in q]


def _reduce(times, vals, err):
    keep = [0]
    i = 0
    n = len(times)
    while i < n - 1:
        j = i + 1
        while j + 1 < n:
            ok = True
            for k in range(i + 1, j + 1):
                t = (times[k] - times[i]) / max(times[j + 1] - times[i], 1e-9)
                if err(vals[k], vals[i], vals[j + 1], t):
                    ok = False
                    break
            if not ok:
                break
            j += 1
        keep.append(j)
        i = j
    return keep


def reduce_keyframes(path, tol_deg=0.1, tol_m=0.0003):
    """Remove keys that linear interpolation reproduces within tolerance (per channel). Loop seams are kept
    because the first and last keys are always kept."""
    js, bin_ = read_glb(path)
    before = after = 0
    rot_err = lambda v, a, b, t: _quat_angle(v, _nlerp(a, b, t)) > tol_deg
    pos_err = lambda v, a, b, t: math.dist(v, [x + (y - x) * t for x, y in zip(a, b)]) > tol_m
    for anim in js.get("animations", []):
        new_samplers = []
        for ch in anim["channels"]:
            s = anim["samplers"][ch["sampler"]]
            path_ = ch["target"]["path"]
            width = 4 if path_ == "rotation" else 3
            times = [t[0] for t in _read_floats(js, bin_, s["input"], 1)]
            vals = [list(v) for v in _read_floats(js, bin_, s["output"], width)]
            keep = _reduce(times, vals, rot_err if width == 4 else pos_err)
            before += len(times)
            after += len(keep)
            inp = _append_floats(js, bin_, [(times[k],) for k in keep], 1, minmax=True)
            out = _append_floats(js, bin_, [vals[k] for k in keep], width)
            new_samplers.append({"input": inp, "output": out, "interpolation": s.get("interpolation", "LINEAR")})
            ch["sampler"] = len(new_samplers) - 1
        anim["samplers"] = new_samplers
    js, bin_ = compact(js, bin_)
    write_glb(path, js, bin_)
    return before, after


def externalize_images(path, shared, rel_dir="../textures"):
    """Images whose name is in `shared` become external files (relative uri) instead of embedded copies."""
    js, bin_ = read_glb(path)
    changed = 0
    for im in js.get("images", []):
        name = im.get("name", "")
        if name in shared and "bufferView" in im:
            del im["bufferView"]
            im.pop("mimeType", None)
            im["uri"] = f"{rel_dir}/{shared[name]}"
            changed += 1
    if changed:
        js, bin_ = compact(js, bin_)
        write_glb(path, js, bin_)
    return changed


def keep_rotation_and_root_motion(path, translation_nodes=("hip",)):
    """Animation banks must not carry per-bone translation/scale keys: those would overwrite the bone lengths
    of whichever skeleton plays the clip. Keep rotations for every joint + translation of the hip only."""
    js, bin_ = read_glb(path)
    names = [n.get("name") for n in js["nodes"]]
    removed = 0
    for a in js.get("animations", []):
        keep = []
        for ch in a["channels"]:
            p = ch["target"]["path"]
            nm = names[ch["target"]["node"]]
            if p == "rotation" or (p == "translation" and nm in translation_nodes):
                keep.append(ch)
            else:
                removed += 1
        used = sorted({ch["sampler"] for ch in keep})
        smap = {s: i for i, s in enumerate(used)}
        a["samplers"] = [a["samplers"][s] for s in used]
        for ch in keep:
            ch["sampler"] = smap[ch["sampler"]]
        a["channels"] = keep
    js, bin_ = compact(js, bin_)
    write_glb(path, js, bin_)
    return removed
