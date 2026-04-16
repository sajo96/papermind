-- Force-fix command field type by recreating the field definition.
-- SurrealDB does not alter existing field types with DEFINE FIELD when field already exists.
REMOVE FIELD command ON academic_paper;
DEFINE FIELD command ON academic_paper TYPE option<record<command>>;
