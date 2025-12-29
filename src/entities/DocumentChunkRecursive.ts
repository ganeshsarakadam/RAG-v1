import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@Entity('document_chunk_recursive')
@Index('IDX_document_chunk_recursive_parent', ['parentId'])
@Index('IDX_document_chunk_recursive_content_hash', ['contentHash'])
export class DocumentChunkRecursive {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('text')
    content!: string;

    @Column('jsonb', { nullable: true })
    metadata!: {
        source?: string;
        parva?: string;
        chapter?: number;
        page?: number;
        speaker?: string;
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
