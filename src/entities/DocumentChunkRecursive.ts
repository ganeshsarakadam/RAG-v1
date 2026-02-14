import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('knowledge_base_chunks')
@Index('IDX_kb_parent', ['parentId'])
@Index('IDX_kb_content_hash', ['contentHash'])
@Index('IDX_kb_religion', ['religion'])
@Index('IDX_kb_text_source', ['textSource'])
@Index('IDX_kb_doc_category', ['docCategory'])
// Composite index for common multi-field queries
@Index('IDX_kb_religion_source_category', ['religion', 'textSource', 'docCategory'])
export class DocumentChunkRecursive {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('text')
    content!: string;

    // Multi-religious knowledge base support
    // Using defaults for data integrity while keeping nullable for backward compatibility
    @Column('varchar', { length: 50, nullable: true, default: 'hinduism' })
    religion!: string | null; // e.g., 'hinduism', 'christianity', 'islam', 'buddhism'

    @Column('varchar', { length: 100, nullable: true, default: 'mahabharatam' })
    textSource!: string | null; // e.g., 'mahabharatam', 'ramayana', 'bible', 'quran'

    @Column('varchar', { length: 50, nullable: true, default: 'scripture' })
    docCategory!: string | null; // e.g., 'scripture', 'encyclopedia', 'commentary', 'translation'

    @Column('jsonb', { nullable: true, default: {} })
    metadata!: {
        source?: string;
        parva?: string;
        chapter?: number;
        page?: number;
        speaker?: string; // Character name - important for role-play!
        chunk_index?: number;
        type?: 'parent' | 'child';
        section_title?: string;
        has_context?: boolean; // Contextual Retrieval: tracks if chunk has contextual embedding
        context_summary?: string; // Contextual Retrieval: the generated context description
        [key: string]: any;
    };

    @Column('vector', { nullable: true })
    embedding!: number[];

    // Parent-child relationship fields
    @Column('uuid', { nullable: true })
    parentId!: string | null;

    @ManyToOne(() => DocumentChunkRecursive, chunk => chunk.children, { nullable: true })
    @JoinColumn({ name: 'parentId' })
    parent!: DocumentChunkRecursive | null;

    @OneToMany(() => DocumentChunkRecursive, chunk => chunk.parent)
    children!: DocumentChunkRecursive[];

    // Deduplication hash (SHA256 of normalized content)
    @Column('varchar', { length: 64, nullable: true })
    contentHash!: string | null;

    // Contextual Retrieval: Content with context prepended for context-aware embeddings
    @Column('text', { nullable: true })
    contextualContent!: string | null;

    // Audit columns for tracking
    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt!: Date;

    @Column({
        type: 'tsvector',
        generatedType: 'STORED',
        asExpression: `to_tsvector('english', content)`,
        select: false,
        nullable: true
    })
    tsk!: any;
}
