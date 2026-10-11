export { mountCreaturePanel, TEST_CREATURES, type PanelController, type PanelDeps, type PanelState } from './mount';
export { buildPanelModel, pieceLabels, type PanelModel, type LimbRow, type DecoRow, type ActionRow, type Warning } from './model';
export { renderProfileSvg, drawProfile, profileExtent, PROFILE_SCALE } from './profileSvg';
export { LimbHighlighter } from './highlight';
export { StructurePanel } from './panel';
export { ROLE_COLOR, ROLE_LABEL, CORE_COLOR, DECO_COLOR } from './colors';
export { mountProber, PROBER_CREATURES, LIVE_ID, type ProberController } from './prober';
export { hudInfo, KEYS_HELP, PROBER_KEYS } from './proberHud';
export { drawProber, viewScale } from './proberDraw';
