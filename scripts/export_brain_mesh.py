#!/usr/bin/env python3
"""
Export a real cortical surface mesh for the frontend 3D visualization.

Source: fsaverage5 (FreeSurfer's standard template brain, MRI-derived),
bundled with nilearn -- no download. This is genuine anatomy: real gyri
and sulci, not a procedurally-wrinkled sphere. Plus the Destrieux atlas
for named anatomical parcels, so regions can be highlighted individually.

Outputs a compact binary + JSON manifest rather than a fat JSON blob:
positions f32, indices u16, sulcal depth u8, parcel labels u8. ~500KB
total vs ~1.2MB as raw JSON.

IMPORTANT / honesty note: EEG topomaps measure *scalp* potentials. Painting
them onto a cortical surface is a presentational projection, NOT source
localization -- we are not solving the inverse problem. The frontend labels
this accordingly. Do not let this drift into a claim about localized
cortical activity.

Usage: python3 scripts/export_brain_mesh.py
"""
import json
from pathlib import Path

import numpy as np
from nilearn import datasets, surface

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "brain"
MESH = "fsaverage5"


def load_hemisphere(fs, atlas, hemi):
    mesh = surface.load_surf_mesh(fs[f"pial_{hemi}"])
    sulc = np.asarray(surface.load_surf_data(fs[f"sulc_{hemi}"]), dtype=np.float32)
    labels = np.asarray(atlas[f"map_{hemi}"], dtype=np.int32)
    return mesh.coordinates.astype(np.float32), mesh.faces.astype(np.int64), sulc, labels


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fs = datasets.fetch_surf_fsaverage(mesh=MESH)
    atlas = datasets.fetch_atlas_surf_destrieux()

    raw_names = [n.decode() if isinstance(n, bytes) else str(n) for n in atlas["labels"]]
    n_region = len(raw_names)

    coords_l, faces_l, sulc_l, lab_l = load_hemisphere(fs, atlas, "left")
    coords_r, faces_r, sulc_r, lab_r = load_hemisphere(fs, atlas, "right")

    n_left = coords_l.shape[0]
    coords = np.vstack([coords_l, coords_r])
    faces = np.vstack([faces_l, faces_r + n_left])
    sulc = np.concatenate([sulc_l, sulc_r])
    # Offset right-hemisphere labels so L and R parcels stay distinguishable.
    labels = np.concatenate([lab_l, lab_r + n_region]).astype(np.int32)

    # FreeSurfer RAS (x=right, y=anterior, z=superior) -> three.js
    # (x=right, y=up, z=toward viewer), so anterior faces the default camera.
    verts = np.column_stack([coords[:, 0], coords[:, 2], coords[:, 1]]).astype(np.float32)

    # Center on the mesh centroid and scale to roughly unit radius so the
    # frontend camera setup doesn't depend on millimeter head size.
    center = verts.mean(axis=0)
    verts -= center
    scale = float(np.abs(verts).max())
    verts /= scale

    n_verts = verts.shape[0]
    n_faces = faces.shape[0]
    if n_verts > 65535:
        raise ValueError(f"{n_verts} vertices exceeds uint16 index range; use a coarser mesh")

    # Sulcal depth -> 0-255. Negative sulc = gyral crown, positive = sulcal
    # fundus; this drives the light/dark banding that makes folds legible.
    s_lo, s_hi = float(sulc.min()), float(sulc.max())
    sulc_u8 = np.clip((sulc - s_lo) / (s_hi - s_lo + 1e-9) * 255, 0, 255).astype(np.uint8)

    if labels.max() > 255:
        raise ValueError("parcel label ids exceed uint8 range")

    blob = b"".join([
        verts.astype("<f4").tobytes(),
        faces.astype("<u2").tobytes(),
        sulc_u8.tobytes(),
        labels.astype(np.uint8).tobytes(),
    ])
    (OUT_DIR / "cortex.bin").write_bytes(blob)

    region_names = [f"L_{n}" for n in raw_names] + [f"R_{n}" for n in raw_names]
    manifest = {
        "source": f"{MESH} pial surface (FreeSurfer template) + Destrieux atlas, via nilearn",
        "note": "Scalp-derived values projected onto cortex for display only -- NOT source localization.",
        "n_vertices": int(n_verts),
        "n_faces": int(n_faces),
        "n_left_vertices": int(n_left),
        "region_names": region_names,
        "layout": [
            {"name": "positions", "type": "float32", "count": int(n_verts * 3)},
            {"name": "indices", "type": "uint16", "count": int(n_faces * 3)},
            {"name": "sulc", "type": "uint8", "count": int(n_verts)},
            {"name": "labels", "type": "uint8", "count": int(n_verts)},
        ],
    }
    (OUT_DIR / "cortex.json").write_text(json.dumps(manifest, indent=2))

    size_kb = len(blob) / 1024
    print(f"vertices : {n_verts:,}")
    print(f"faces    : {n_faces:,}")
    print(f"regions  : {len(region_names)} ({n_region} per hemisphere)")
    print(f"binary   : {size_kb:.0f} KB -> {OUT_DIR/'cortex.bin'}")
    print(f"manifest : {OUT_DIR/'cortex.json'}")


if __name__ == "__main__":
    main()
