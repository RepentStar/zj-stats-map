/** Shared canvas/SVG colors, coordinated with the CSS surface tokens. */
export const theme = {
  surface: '#101f30',
  ink: '#e4eef7',
  muted: '#9fb4c9',
  line: '#30465d',
  accent: '#79cbd9',
  selection: '#efbf76',
  noData: '#354354',
  mapBoundary: '#8cb7cc',
  mapLabelOutline: '#0b1828',
  mapColors: ['#193b55', '#225979', '#2e779b', '#419dc0', '#79cbd9'],
  cityColors: ['#79cbd9', '#8caef0', '#efbf76', '#b5a1e8', '#e89fac', '#a8c98a',
    '#7ebbc9', '#d7cc85', '#a0a5ef', '#d5a28e', '#8fc6b0'],
}

export const chartLegend = {
  textStyle: { color: theme.muted },
  pageTextStyle: { color: theme.muted },
  pageIconColor: theme.accent,
  pageIconInactiveColor: theme.line,
}

export const chartTooltip = {
  backgroundColor: theme.surface,
  borderColor: theme.line,
  textStyle: { color: theme.ink },
}
