export const DEFAULT_PRETEST_SETTINGS = {
  lower_target: 0.4,
  upper_target: 0.95,
  probe_rule: {
    success_target: 10,
    trial_cap: 30,
  },
  search: {
    max_probes_per_axis: 12,
    refine_steps_per_edge: 2,
  },
  global_limits: {
    min_triangle_size: 10,
    max_triangle_size: 400,
    min_saturation: 0,
    max_saturation: 1,
  },
  debug: {
    enabled: true,
  },
  simulation: {
    enabled: false,
  },
  display: {
    masking: {
      duration_ms: 0,
    },
    eink: {
      enabled: false,
      flash_color: "white",
      flash_duration_ms: 100,
    },
    flip: {
      horizontal: false,
      vertical: false,
    },
    invert_colors: false,
  },
};

export const normalizePretestSettings = (value) => {
  const data = value ?? {};
  return {
    ...DEFAULT_PRETEST_SETTINGS,
    ...data,
    probe_rule: {
      ...DEFAULT_PRETEST_SETTINGS.probe_rule,
      ...(data.probe_rule ?? {}),
    },
    search: {
      ...DEFAULT_PRETEST_SETTINGS.search,
      ...(data.search ?? {}),
    },
    global_limits: {
      ...DEFAULT_PRETEST_SETTINGS.global_limits,
      ...(data.global_limits ?? {}),
    },
    debug: {
      ...DEFAULT_PRETEST_SETTINGS.debug,
      ...(data.debug ?? {}),
    },
    simulation: {
      ...DEFAULT_PRETEST_SETTINGS.simulation,
      ...(data.simulation ?? {}),
    },
    display: {
      ...DEFAULT_PRETEST_SETTINGS.display,
      ...(data.display ?? {}),
      masking: {
        ...DEFAULT_PRETEST_SETTINGS.display.masking,
        ...(data.display?.masking ?? {}),
      },
      eink: {
        ...DEFAULT_PRETEST_SETTINGS.display.eink,
        ...(data.display?.eink ?? {}),
      },
      flip: {
        ...DEFAULT_PRETEST_SETTINGS.display.flip,
        ...(data.display?.flip ?? {}),
      },
      invert_colors:
        data.display?.invert_colors ??
        DEFAULT_PRETEST_SETTINGS.display.invert_colors,
    },
  };
};
