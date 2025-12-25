import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('document_chunk_recursive')
@Index('IDX_document_chunk_recursive_tsk', ['tsk'], { fulltext: true })
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
        [key: string]: any;
    };

    @Column('vector', { nullable: true })
    embedding!: number[];

    @Column({
        type: 'tsvector',
        generatedType: 'STORED',
        asExpression: `to_tsvector('english', content)`,
        select: false,
        nullable: true
    })
    tsk!: any;
}
