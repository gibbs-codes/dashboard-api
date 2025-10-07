/**
 * CTA Stop IDs Configuration
 *
 * Hardcoded CTA stop IDs for specific locations
 *
 * To find stop IDs:
 * - Bus stops: Use CTA Bus Tracker API or check stop signs for stop IDs
 *   API: http://www.ctabustracker.com/bustime/api/v2/getstops
 *
 * - Train stops: Use CTA Train Tracker API or reference CTA documentation
 *   API: http://lapi.transitchicago.com/api/1.0/ttpositions.aspx
 *   Documentation: https://www.transitchicago.com/developers/
 *
 * Change these values to customize which stops are tracked
 */

module.exports = {
  // ============================================
  // Bus Routes
  // ============================================
  bus: {
    // Route 77 - Belmont Avenue
    route77: {
      routeId: '77',
      eastbound: {
        stopId: '1129',  // Belmont & Sheffield (Eastbound)
        direction: 'Eastbound'
      },
      westbound: {
        stopId: '1130',  // Belmont & Sheffield (Westbound)
        direction: 'Westbound'
      }
    }

    // To add more bus routes, follow this pattern:
    // route[NUMBER]: {
    //   routeId: '[NUMBER]',
    //   [direction]: {
    //     stopId: '[STOP_ID]',
    //     direction: '[Direction Name]'
    //   }
    // }
  },

  // ============================================
  // Train Lines
  // ============================================
  train: {
    // Red Line
    redLine: {
      lineCode: 'Red',
      stops: [
        {
          stopId: '41380',  // Belmont Red Line station
          stopName: 'Belmont',
          direction: 'Service toward 95th/Dan Ryan'
        }
        // Add more Red Line stops here if needed
      ]
    },

    // Brown Line
    brownLine: {
      lineCode: 'Brn',
      stops: [
        {
          stopId: '40460',  // Belmont Brown Line station
          stopName: 'Belmont',
          direction: 'Service toward Kimball'
        }
        // Add more Brown Line stops here if needed
      ]
    }

    // To add more train lines, follow this pattern:
    // [lineName]: {
    //   lineCode: '[Line Code]',  // Red, Blue, Brn, G, Org, P, Pink, Y
    //   stops: [
    //     {
    //       stopId: '[MAP_ID]',
    //       stopName: '[Station Name]',
    //       direction: '[Direction Description]'
    //     }
    //   ]
    // }
  }
};
