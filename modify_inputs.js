const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove icon spans (prefix icons)
    content = content.replace(/<span className="material-symbols-outlined absolute left-[\d\.]+\s+top-[^>]+>[^<]+<\/span>\s*/g, '');
    
    // Replace padding
    content = content.replace(/pl-11 pr-4/g, 'px-4');
    content = content.replace(/pl-12 pr-4/g, 'px-4');
    content = content.replace(/pl-10 pr-2/g, 'px-4');
    
    fs.writeFileSync(filePath, content);
    console.log(`Processed ${filePath}`);
}

processFile('src/pages/AddPatient.jsx');
processFile('src/pages/PatientDetail.jsx');
