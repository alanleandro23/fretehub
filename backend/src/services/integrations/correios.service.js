const { mockResult } = require('./base');

async function quoteFreight(payload) {
  const carrier = 'correios';

  const map = {
    jamef: [68, 7],
    braspress: [72, 6],
    correios: [85, 8],
    camilo: [90, 9],
  };

  const [base, days] = map[carrier];

  return mockResult(
    carrier.charAt(0).toUpperCase() + carrier.slice(1),
    payload,
    base,
    days
  );
}

module.exports = { quoteFreight };