/**
 * Art source configuration and rotation settings
 */
module.exports = {
  poolSize: 12,
  poolTtlSeconds: 3600,
  retryDelayMs: 500,
  rotationIntervals: {
    portrait: 300, // 5 minutes
    landscape: 420, // 7 minutes
    tv: 360 // 6 minutes
  },
  sources: {
    artic: {
      enabled: true,
      weight: 35,
      styles: ['Cubism', 'Expressionism', 'Surrealism', 'Abstract', 'Minimalism', 'Constructivism', 'Symbolism', 'Suprematism', 'Bauhaus']
    },
    met: {
      enabled: true,
      weight: 35,
      hasImages: true,
      departments: [11, 21, 26, 30] // European Paintings, The American Wing, Drawings/Prints, Photographs
    },
    cleveland: {
      enabled: true,
      weight: 20,
      type: 'Painting'
    },
    giphy: {
      enabled: false,
      weight: 0
    }
  }
};
