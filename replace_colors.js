const fs = require('fs');
const path = require('path');

const DIRECTORIES = ['components', 'src'];

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Substituir classes focus:ring-cyan-*, focus:ring-blue-* etc
    // focus:ring-cyan-500/5 -> focus:ring-[var(--primary-color)]/20 or similar? 
    // Wait, let's keep it simple: focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)]
    content = content.replace(/focus:ring-cyan-\d+(?:\/\d+)?/g, 'focus:ring-[var(--primary-color)]/20');
    content = content.replace(/focus:border-cyan-\d+/g, 'focus:border-[var(--primary-color)]');
    
    // Some are focus:ring-cyan-brand
    content = content.replace(/focus:ring-cyan-brand(?:\/\d+)?/g, 'focus:ring-[var(--primary-color)]/20');
    content = content.replace(/focus:border-cyan-brand/g, 'focus:border-[var(--primary-color)]');

    // Substituir bg-cyan-50 por styles inlines quando der, ou apagar. 
    // Em tailwind, não dá para fazer bg-[color-mix...] nativo antes da v3.3 (ou fica feio), mas já fizemos inline styles na mão.
    // Vamos varrer os arquivos e relatar onde tem bg-cyan-50, etc.
    
    // Replace text-cyan-600 with text-[var(--primary-color)]
    content = content.replace(/text-cyan-600/g, 'text-[var(--primary-color)]');
    content = content.replace(/text-cyan-500/g, 'text-[var(--primary-color)]');
    content = content.replace(/border-cyan-100/g, 'border-[var(--primary-color)]/20');
    content = content.replace(/border-cyan-200/g, 'border-[var(--primary-color)]/30');
    content = content.replace(/border-cyan-500/g, 'border-[var(--primary-color)]');

    // Substituir bg-cyan-50 (This requires inline style insertion usually, but can be done as bg-[var(--primary-color)]/10 in modern tailwind)
    // Actually Tailwind supports `bg-[var(--primary-color)]/10` ONLY IF primary color is RGB list.
    // Let's replace bg-cyan-50 with `style={{backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)'}}`?
    // Doing this automatically is dangerous for React elements.
    // Instead we can remove bg-cyan-50 and just add a data-attribute or something, but let's leave bg-cyan-50 to manual or let's find out where they are.

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated: ' + filePath);
    }
}

function traverseDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    });
}

DIRECTORIES.forEach(dir => traverseDir(path.join(__dirname, dir)));
console.log('Script finished.');
