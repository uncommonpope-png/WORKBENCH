const PLTEngine = {
  calculateTrueValue: (profit, love, tax) => profit + love - tax,
  recordTransition: (fromState, toState, metrics) => {
    const profit = metrics.profit || 0;
    const love = metrics.love || 0;
    const tax = metrics.tax || 0;
    const trueValue = profit + love - tax;
    return {
      fromState,
      toState,
      metrics: { profit, love, tax },
      trueValue,
      timestamp: Date.now()
    };
  }
};
module.exports = PLTEngine;
