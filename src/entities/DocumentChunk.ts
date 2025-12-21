import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
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
}
