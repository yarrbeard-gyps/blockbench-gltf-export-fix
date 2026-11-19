Improves Blockbench's glTF export (Binary and ASCII):

- **Smooth, mipmapped textures:** samplers are written as LINEAR / LINEAR_MIPMAP_LINEAR (like Blender's exports) instead of nearest, so engines such as Godot import them smooth with mipmaps. Untick **Smooth texture filtering (mipmaps)** in the export dialog to keep crisp pixel filtering.
- **No silent empty exports:** the scene is re-synced with the outliner before exporting, so nested groups that have come loose can't produce an export that writes no file.
