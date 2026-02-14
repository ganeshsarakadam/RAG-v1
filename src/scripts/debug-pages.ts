import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');

const PDF_FILE_NAME = 'Mahabharata (Unabridged in English).pdf';
const FILE_PATH = path.join(__dirname, '../../', PDF_FILE_NAME);

interface PageInfo {
    pageNum: number;
    startIndex: number;
    endIndex: number;
    charCount: number;
}

const testPageByPage = async () => {
    try {
        console.log('🔍 Testing page-by-page PDF parsing...\n');

        const dataBuffer = fs.readFileSync(FILE_PATH);

        const pages: PageInfo[] = [];
        let totalText = '';
        let currentIndex = 0;

        // Custom page render function that processes each page
        const renderPage = (pageData: any) => {
            return pageData.getTextContent()
                .then((textContent: any) => {
                    // Extract text from this page
                    let pageText = '';
                    let lastY: number | null = null;

                    for (const item of textContent.items) {
                        // Add newline if y position changes (new line)
                        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                            pageText += '\n';
                        }
                        pageText += item.str;
                        lastY = item.transform[5];
                    }

                    const pageNum = pages.length + 1;
                    const startIndex = currentIndex;
                    const endIndex = currentIndex + pageText.length;

                    pages.push({
                        pageNum,
                        startIndex,
                        endIndex,
                        charCount: pageText.length
                    });

                    totalText += pageText + '\n';  // Add separator between pages
                    currentIndex = totalText.length;

                    // Log progress every 100 pages
                    if (pageNum % 100 === 0) {
                        console.log(`   Processed page ${pageNum}...`);
                    }

                    return pageText;
                });
        };

        const options = {
            pagerender: renderPage
        };

        console.log('📖 Parsing PDF page by page (this will take a while)...');
        const startTime = Date.now();

        const data = await pdf(dataBuffer, options);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Parsed ${data.numpages} pages in ${elapsed}s`);

        // Show page stats
        console.log(`\n📊 Page Statistics:`);
        console.log(`   Total pages: ${pages.length}`);
        console.log(`   Total characters: ${totalText.length}`);

        // Show first 5 pages info
        console.log(`\n📄 First 10 pages:`);
        pages.slice(0, 10).forEach(p => {
            console.log(`   Page ${p.pageNum}: chars ${p.startIndex}-${p.endIndex} (${p.charCount} chars)`);
        });

        // Find a section and show its page
        const sectionMatches = [...totalText.matchAll(/SECTION\s+([IVXLCDM]+)/g)];
        console.log(`\n📚 Sample section locations:`);
        sectionMatches.slice(0, 5).forEach(match => {
            const pos = match.index!;
            const page = pages.find(p => pos >= p.startIndex && pos < p.endIndex);
            console.log(`   "${match[0]}" at char ${pos} -> Page ${page?.pageNum || 'unknown'}`);
        });

        console.log('\n✅ Page-by-page parsing works!');
        console.log('💡 This approach can give us accurate page numbers.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
};

testPageByPage();
