# glTF Export Fix for Blockbench

A Blockbench 5.2+ plugin with two fixes to Blockbench's own **File ▸ Export ▸ Export glTF Model**, in both Binary (glb) and ASCII (gltf):

1. **Textures export smooth, with mipmaps.** Blockbench writes every texture sampler as nearest/nearest (`9728`/`9728`),
   so Godot imports the textures pixelated, with no mipmaps. This plugin writes `magFilter 9729` (LINEAR) and
   `minFilter 9987` (LINEAR_MIPMAP_LINEAR), the same as Blender's exports. `wrapS`/`wrapT` are left as written.
2. **No silent empty exports.** In Blockbench 5.2.2 a nested group (a group inside a group) can come loose from its
   parent in the 3D scene while the outliner still shows it nested. The exporter follows the 3D scene, finds
   nothing under the top group, and Binary export fails silently: no file, and only a `"data" argument must be
   ... Received an instance of Object` error in the console. Before each export this plugin runs
   `Canvas.updateAll()`, which re-attaches everything. If a Binary export still comes out empty, you get an
   error message instead of a silent failure. (Without the plugin, saving, closing and reopening the project
   also fixes it.)

## Install
Download [`gltf_export_fix.js`](gltf_export_fix.js) (and optionally `about.md`, next to it). In Blockbench (desktop):
**File ▸ Plugins ▸ Load Plugin from File**, then pick the `.js`. It works alongside other plugins, including
[glTF Armature Importer](https://github.com/yarrbeard-gyps/blockbench-gltf-armature-importer).

## Option
The export dialog gets a new checkbox, **Smooth texture filtering (mipmaps)**, on by default. Untick it for crisp,
pixelated models, and Blockbench's nearest filtering is kept. Blockbench remembers the choice per project, like
the other export options.

## How it works
It wraps `Codecs.gltf.compile`; GLTFExporter itself isn't modified. In a `.glb` only the JSON part is rewritten,
and the binary data is copied byte for byte. Anything else that calls the glTF codec (for example **Export to
Blender**) gets the same treatment. Disabling the plugin restores the original compile and removes the checkbox.

## Tested
In Blockbench 5.2.2 with Godot 4.7: a textured model exported with the plugin imports into Godot smooth and
mipmapped, where without the plugin it came in pixelated.

Offline ([`tests/`](tests)): Node tests on a Blockbench-style `.glb` and `.gltf`:
- samplers become 9729/9987 and the wrap modes are unchanged;
- the binary chunk is byte-identical and the GLB header and padding are valid;
- the output re-imports with the glTF Armature Importer;
- with the checkbox off, the output is untouched;
- an empty Binary export now stops with a message.

The plugin was also loaded against a mock of Blockbench's codec to check registration, the dialog option, the
re-sync call and unload.

## Credits
Written with the help of an AI coding assistant (Claude), and tested as described above. Issues and pull
requests are welcome.

## License
[MIT](LICENSE)
