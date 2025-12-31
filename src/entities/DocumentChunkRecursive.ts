import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@Entity('knowledge_base_chunks')
@Index('IDX_kb_parent', ['parentId'])
@Index('IDX_kb_content_hash', ['contentHash'])
@Index('IDX_kb_religion', ['religion'])
@Index('IDX_kb_text_source', ['textSource'])
export class DocumentChunkRecursive {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('text')
    content!: string;

    // Multi-religious knowledge base support
    @Column('varchar', { length: 50, nullable: true })
    religion!: string | null; // e.g., 'hinduism', 'christianity', 'islam', 'buddhism'

    @Column('varchar', { length: 100, nullable: true })
    textSource!: string | null; // e.g., 'mahabharatam', 'ramayana', 'bible', 'quran'

    @Column('jsonb', { nullable: true })
    metadata!: {
        source?: string;
        parva?: string;
        chapter?: number;
        page?: number;
        speaker?: string; // Character name - important for role-play!
        chunk_index?: number;
        type?: 'parent' | 'child';
        section_title?: string;
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

    @Column({
        type: 'tsvector',
        generatedType: 'STORED',
        asExpression: `to_tsvector('english', content)`,
        select: false,
        nullable: true
    })
    tsk!: any;
}
