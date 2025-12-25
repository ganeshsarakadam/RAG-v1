import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index('IDX_document_chunk_tsk', ['tsk'], { fulltext: true })
export class DocumentChunk {
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
        nullable: true // Allow nulls initially if needed, though generated usually populates
    })
    tsk!: any;
}
