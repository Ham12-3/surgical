# BodyParts3D source meshes

Three organ meshes from BodyParts3D / Anatomography version 3.0 (20110915),
fetched from the GitHub mirror
`Kevin-Mattheus-Moerman/BodyParts3D` (`assets/BodyParts3D_data/stl/`),
which converted the original OBJ files to binary STL:

| File | FMA id | Structure |
| --- | --- | --- |
| `FMA14542_appendix.stl` | FMA14542 | vermiform appendix |
| `FMA14543nsn_colon.stl` | FMA14543 (nsn) | colon, caecum to rectum |
| `FMA7208_ileum.stl` | FMA7208 | ileum |

Coordinates are millimetres in the LPS convention (x toward the patient's
left, y toward the back, z up), origin at the floor, for one adult male.
`blender/scripts/build_organs.py` turns them into `public/models/anat_ileocaecum.glb`.

Licence: Creative Commons Attribution-Share Alike 2.1 Japan
(`LICENSE_content.txt`). Required credit:

> BodyParts3D, (c) The Database Center for Life Science licensed under
> CC Attribution-Share Alike 2.1 Japan

Cite: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K.
BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids
Res. 2009;37(Database issue):D782-5. https://doi.org/10.1093/nar/gkn613
Data archive: http://doi.org/10.18908/lsdba.nbdc00837-000
