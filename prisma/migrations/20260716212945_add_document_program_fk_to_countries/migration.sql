-- AddForeignKey
ALTER TABLE `document_program_description_countries` ADD CONSTRAINT `document_program_description_countries_document_program_id_fkey` FOREIGN KEY (`document_program_id`) REFERENCES `document_programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
