/**
 * Query Classifier - Determines optimal docCategory based on query type
 *
 * Analyzes user queries to route them to the most appropriate document category:
 * - encyclopedia: Factual "who/what/where/when" questions
 * - scripture: Direct quotes, dialogues, "what did X say" questions
 * - commentary: Explanations, interpretations, "why/how/explain" questions
 */

export interface QueryClassification {
    primaryCategory: string | null;
    categoryWeights: {
        encyclopedia: number;
        scripture: number;
        commentary: number;
    };
    confidence: 'high' | 'medium' | 'low';
    queryType: string;
}

export class QueryClassifier {
    /**
     * Classify a query and determine which document categories to prioritize
     */
    static classify(query: string): QueryClassification {
        const normalizedQuery = query.toLowerCase().trim();

        // Initialize weights
        const weights = {
            encyclopedia: 0,
            scripture: 0,
            commentary: 0
        };

        let queryType = 'general';
        let confidence: 'high' | 'medium' | 'low' = 'low';

        // Pattern 1: Factual questions (encyclopedia)
        if (/^(who|what|where|when|which)\s+(is|are|was|were|did)/i.test(normalizedQuery)) {
            weights.encyclopedia = 1.5;
            weights.scripture = 0.5;
            weights.commentary = 0.3;
            queryType = 'factual';
            confidence = 'high';
        }

        // Pattern 2: Direct quotes/dialogue (scripture)
        else if (/what\s+(did|does|has)\s+\w+\s+(say|said|tell|told|speak|spoke)/i.test(normalizedQuery)) {
            weights.scripture = 1.5;
            weights.commentary = 0.5;
            weights.encyclopedia = 0.3;
            queryType = 'dialogue';
            confidence = 'high';
        }

        // Pattern 3: Quote-related keywords (scripture)
        else if (/(quote|dialogue|conversation|verse|spoke|said to|told)/i.test(normalizedQuery)) {
            weights.scripture = 1.4;
            weights.commentary = 0.4;
            weights.encyclopedia = 0.2;
            queryType = 'quote-related';
            confidence = 'medium';
        }

        // Pattern 4: Explanation requests (commentary)
        else if (/(explain|why|how|interpret|mean|significance|symbolize)/i.test(normalizedQuery)) {
            weights.commentary = 1.5;
            weights.encyclopedia = 0.5;
            weights.scripture = 0.3;
            queryType = 'explanation';
            confidence = 'high';
        }

        // Pattern 5: Background/context (encyclopedia)
        else if (/(background|context|history|family|lineage|descendant)/i.test(normalizedQuery)) {
            weights.encyclopedia = 1.3;
            weights.commentary = 0.4;
            weights.scripture = 0.3;
            queryType = 'background';
            confidence = 'medium';
        }

        // Pattern 6: Character-focused questions (encyclopedia + scripture)
        else if (/(character|person|warrior|king|queen|sage)/i.test(normalizedQuery)) {
            weights.encyclopedia = 1.2;
            weights.scripture = 0.8;
            weights.commentary = 0.3;
            queryType = 'character';
            confidence = 'medium';
        }

        // Pattern 7: Analysis/interpretation (commentary)
        else if (/(analyze|compare|contrast|relationship|symbolism)/i.test(normalizedQuery)) {
            weights.commentary = 1.3;
            weights.encyclopedia = 0.4;
            weights.scripture = 0.3;
            queryType = 'analysis';
            confidence = 'medium';
        }

        // Default: Balanced search
        else {
            weights.encyclopedia = 1.0;
            weights.scripture = 1.0;
            weights.commentary = 1.0;
            queryType = 'general';
            confidence = 'low';
        }

        // Determine primary category
        let primaryCategory: string | null = null;
        if (confidence === 'high' || confidence === 'medium') {
            const maxWeight = Math.max(weights.encyclopedia, weights.scripture, weights.commentary);
            if (weights.encyclopedia === maxWeight) primaryCategory = 'encyclopedia';
            else if (weights.scripture === maxWeight) primaryCategory = 'scripture';
            else if (weights.commentary === maxWeight) primaryCategory = 'commentary';
        }

        return {
            primaryCategory,
            categoryWeights: weights,
            confidence,
            queryType
        };
    }

    /**
     * Get suggested categories in priority order
     */
    static getSuggestedCategories(query: string): string[] {
        const classification = this.classify(query);
        const { categoryWeights } = classification;

        // Sort categories by weight (descending)
        const sorted = Object.entries(categoryWeights)
            .sort(([, a], [, b]) => b - a)
            .map(([category]) => category);

        return sorted;
    }

    /**
     * Check if query should filter to specific category
     * Only returns category if confidence is high
     */
    static shouldFilterByCategory(query: string): string | null {
        const classification = this.classify(query);
        if (classification.confidence === 'high') {
            return classification.primaryCategory;
        }
        return null;
    }
}

/**
 * Example usage:
 *
 * const classification = QueryClassifier.classify("Who is Arjuna?");
 * // => { primaryCategory: 'encyclopedia', confidence: 'high', ... }
 *
 * const categories = QueryClassifier.getSuggestedCategories("What did Krishna say to Arjuna?");
 * // => ['scripture', 'commentary', 'encyclopedia']
 *
 * const filter = QueryClassifier.shouldFilterByCategory("Explain the Bhagavad Gita");
 * // => 'commentary'
 */
