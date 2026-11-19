# Offline tests (Node 18+)

Run from the repository root. It needs the glTF Armature Importer (to read GLB files) and any textured `.glb`,
for example `test-files/tex_embedded.glb` from that repository.

```sh
node tests/verify_export_fix.js ./gltf_export_fix.js path/to/gltf_armature_importer.js path/to/tex_embedded.glb
```

It checks the sampler rewrite for Binary and ASCII output (filters changed, wrap modes kept, BIN chunk
byte-identical, valid GLB header and padding, still re-importable). It also loads the plugin against a mocked
`Codecs.gltf` to check the dialog option, the scene re-sync, the empty-export guard and unloading.
