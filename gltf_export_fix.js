/*
 * glTF Export Fix for Blockbench 5.2+
 *
 * Wraps Codecs.gltf.compile (GLTFExporter itself is untouched) and, on every glTF export:
 *  1. Re-syncs the 3D scene with the outliner first (Canvas.updateAll), so nested groups that came
 *     loose can't produce an empty export.
 *  2. Writes texture samplers as smooth + mipmapped (mag LINEAR 9729, min LINEAR_MIPMAP_LINEAR 9987),
 *     the same as Blender's exports. An export-dialog checkbox keeps Blockbench's nearest filtering.
 *  3. If a Binary export still comes out without data, stops with a clear message instead of
 *     failing silently.
 *
 * The rewrite functions (above "Blockbench layer") have no Blockbench dependencies, for Node tests.
 */
(function () {
	'use strict';

	const PLUGIN_ID = 'gltf_export_fix';
	const OPTION_KEY = 'smooth_texture_filtering';
	const GL = { NEAREST: 9728, LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987 };

	// ---------------------------------------------------------------- output rewriting

	function setSamplers(json, smooth) {
		if (!smooth || !Array.isArray(json.samplers)) return 0;
		for (const s of json.samplers) {
			s.magFilter = GL.LINEAR;
			s.minFilter = GL.LINEAR_MIPMAP_LINEAR;
			// wrapS / wrapT stay as written
		}
		return json.samplers.length;
	}

	// GLB: rewrite the JSON chunk, keep the BIN chunk byte-for-byte.
	function rewriteGlb(arrayBuffer, edit) {
		const dv = new DataView(arrayBuffer);
		if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a GLB');
		const total = dv.getUint32(8, true);
		let offset = 12, json = null;
		const others = [];
		while (offset < total) {
			const len = dv.getUint32(offset, true);
			const type = dv.getUint32(offset + 4, true);
			const bytes = new Uint8Array(arrayBuffer, offset + 8, len);
			if (type === 0x4E4F534A && json === null) json = JSON.parse(new TextDecoder().decode(bytes));
			else others.push({ type, bytes });
			offset += 8 + len;
		}
		if (!json) throw new Error('GLB has no JSON chunk');
		const changed = edit(json);
		if (!changed) return arrayBuffer;

		let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
		const pad = (4 - (jsonBytes.length % 4)) % 4;
		if (pad) {
			const padded = new Uint8Array(jsonBytes.length + pad).fill(0x20);
			padded.set(jsonBytes);
			jsonBytes = padded;
		}
		const size = 12 + 8 + jsonBytes.length + others.reduce((n, c) => n + 8 + c.bytes.length, 0);
		const out = new ArrayBuffer(size);
		const odv = new DataView(out), o8 = new Uint8Array(out);
		odv.setUint32(0, 0x46546C67, true);
		odv.setUint32(4, 2, true);
		odv.setUint32(8, size, true);
		let p = 12;
		const writeChunk = (type, bytes) => {
			odv.setUint32(p, bytes.length, true);
			odv.setUint32(p + 4, type, true);
			o8.set(bytes, p + 8);
			p += 8 + bytes.length;
		};
		writeChunk(0x4E4F534A, jsonBytes);
		others.forEach(c => writeChunk(c.type, c.bytes));
		return out;
	}

	/** Apply the sampler setting to whatever compile returned (GLB ArrayBuffer, JSON string or object). */
	function applyToOutput(result, smooth) {
		const edit = json => setSamplers(json, smooth);
		if (result instanceof ArrayBuffer) return rewriteGlb(result, edit);
		if (typeof result === 'string') {
			const json = JSON.parse(result);
			return edit(json) ? JSON.stringify(json) : result;
		}
		if (result && typeof result === 'object') { edit(result); return result; }
		return result;
	}

	const core = { setSamplers, rewriteGlb, applyToOutput, GL };

	// Outside Blockbench (Node tests) export the core and stop here.
	if (typeof Plugin === 'undefined' || typeof Codecs === 'undefined') {
		if (typeof module === 'object' && module && module.exports) module.exports = core;
		return;
	}

	// ================================================================ Blockbench layer

	let originalCompile = null;
	let wrapper = null;
	let active = false;

	function resyncScene() {
		// Re-runs updateTransform on every group and element, which re-attaches each 3D object to
		// its outliner parent (see blockbench-gltf-importer/BLOCKBENCH-BUG-nested-group-export.md).
		try { Canvas.updateAll(); } catch (err) { console.warn('[glTF Export Fix] scene re-sync failed', err); }
	}

	Plugin.register(PLUGIN_ID, {
		title: 'glTF Export Fix',
		author: 'yarrbeard-gyps',
		description: 'Smooth, mipmapped texture filtering in glTF exports, and no more silent empty exports.',
		icon: 'blur_on',
		version: '1.0.0',
		variant: 'desktop',
		min_version: '5.2.0',
		tags: ['Exporter', 'Texture'],
		onload() {
			const codec = Codecs.gltf;
			if (!codec) { console.warn('[glTF Export Fix] Codecs.gltf not found'); return; }

			codec.export_options[OPTION_KEY] = {
				type: 'checkbox',
				label: 'Smooth texture filtering (mipmaps)',
				description: 'Untick to keep Blockbench\'s nearest (pixelated) filtering for crisp models',
				value: true,
			};

			originalCompile = codec.compile;
			active = true;
			wrapper = async function (options) {
				if (!active) return originalCompile.call(this, options);
				const merged = Object.assign(this.getExportOptions(), options);
				resyncScene();
				const result = await originalCompile.call(this, options);
				if (merged.encoding === 'binary' && !(result instanceof ArrayBuffer)) {
					const msg = 'The glTF export came out empty, so no file was written. Close and reopen the project, then export again.';
					Blockbench.showMessageBox({ title: 'glTF export failed', message: msg, icon: 'error' });
					throw new Error(msg);
				}
				return applyToOutput(result, merged[OPTION_KEY] !== false);
			};
			codec.compile = wrapper;
		},
		onunload() {
			active = false;
			const codec = Codecs.gltf;
			if (!codec) return;
			delete codec.export_options[OPTION_KEY];
			// Only restore if nobody wrapped compile after us; otherwise our wrapper just passes through.
			if (codec.compile === wrapper && originalCompile) codec.compile = originalCompile;
		},
	});
})();
