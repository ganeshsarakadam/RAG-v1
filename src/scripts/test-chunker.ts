import { recursiveChunking } from '../utils/recursive-chunking';

const sampleText = `
# The Mahabharata

The Mahabharata is one of the two major Sanskrit epics of ancient India, the other being the Ramayana. It narrates the struggle between two groups of cousins in the Kurukshetra War and the fates of the Kaurava and the Pandava princes and their successors.

It also contains philosophical and devotional material, such as a discussion of the four "goals of life" or purusharthas (12.161). Among the principal works and stories in the Mahabharata are the Bhagavad Gita, the story of Damayanti, the story of Shakuntala, the story of Pururava and Urvashi, the story of Savitri and Satyavan, the story of Kacha and Devayani, the story of Rishyasringa and an abbreviated version of the Ramayana, often considered as works in their own right.

Traditionally, the authorship of the Mahabharata is attributed to Vyasa. There have been many attempts to unravel its historical growth and compositional layers. The bulk of the Mahabharata was probably compiled between the 3rd century BCE and the 3rd century CE, with the oldest preserved parts not much older than around 400 BCE. The epic serves as a source for information on the development of Hinduism between 400 BCE and 200 CE and is regarded by Hindus as both a text about dharma (Hindu moral law) and a history (itihasa).

The Mahabharata is the longest poem known to have been composed. It is described as "the longest poem ever written". Its longest version consists of over 100,000 shloka or over 200,000 individual verse lines (each shloka is a couplet), and long prose passages. About 1.8 million words in total, the Mahabharata is roughly ten times the length of the Iliad and the Odyssey combined, or about four times the length of the Ramayana. W. J. Johnson has compared the importance of the Mahabharata in the context of world civilization to that of the Bible, the Quran, the works of Homer, Greek drama, or the works of William Shakespeare.
`;

console.log('--- Testing Recursive Chunking ---');
const chunks = recursiveChunking(sampleText, 500, 50);

console.log(`Total Chunks: ${chunks.length}`);
chunks.forEach((chunk, i) => {
    console.log(`\n[Chunk ${i + 1}] (Length: ${chunk.length})`);
    console.log('--------------------------------------------------');
    console.log(chunk);
    console.log('--------------------------------------------------');
});
