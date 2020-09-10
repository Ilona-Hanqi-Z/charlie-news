### Database Migration

Database versions are numbered in sequential order, i.e. 1, 2, 3...

Migration files are named for the version they migrate to (`1.sql`, `2.sql`) and are stored in the `migrations` folder.
Other files will be ignored (`dog.sql`). If a version number is missing (`1.sql`, `3.sql`) that version will be skipped
(`2.sql` is skipped).

The migrations are run using psql, so other files can be referenced using the `\i` command, as well as other psql
features. Each file is run in its own transaction.
