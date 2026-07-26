const data = require('../src/data/emergencyTemplates.json')
console.log('Total templates:', data.length)
console.log('Unique patient names:', [...new Set(data.map(d => d.patientName))])
