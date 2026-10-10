# Phase 5 — Barbarian in both art styles

Local production for Felipe's review, 2026-10-09. Uses the approved female concept 4: long copper-red hair, red warpaint, leather and fur outfit, steel axe. Replaces the provisional Knight appearance for existing `berserker`; gameplay rules and class identifiers are unchanged.

Final runtime assets: 50 painted lossless WebP strips, five large painted portraits and 50 pixel PNG strips. Both styles have ten actions, 36 frames per element, five elements. Painted frames are 384×384, foot anchor [192,360]. Pixel runtime frames are 204×192 including horizontal padding, foot anchor [102,180]; the native 192×192 drawing gives axe swings enough room without shrinking the body. Other hero frame dimensions are unchanged.

Limited animation uses ten illustrated poses, anchored breathing and small integer translations. Element masks recolor selected sash fabric, preserving hair, skin, warpaint and alpha. Original atlases, prompts, PNG/@2x delivery, masks and manifests remain in the local `Pedido de Arte Pixel Art/fase_5_barbara` directory, outside the repository.

Review route: `/galeria-px/actualizacion-heroes`, development only. Five class cards, style/action/element selectors, equipment and battle fixtures. The default fixtures show the Barbarian; the checkbox restores the Knight. No player inventory or currency changes.

Status: approved by Felipe on 2026-10-10 for commit and push.

Validation: 105 runtime files match their delivery hashes and dimensions; 360 per-frame recolor checks preserve alpha and pixels outside masks. No frame clips at its border. Source TypeScript and changed-file ESLint pass; 52 test files / 526 tests pass. Visual review of cards, equipment and arena in both styles, with no horizontal overflow at 390×844, 1920×1080 and 2560×1440. Masks exclude detached red leg markings. See the local delivery for visual previews and export validation.
