-- Publication dates for the files already loaded (sql/load_07_published_on.sql
-- added PUBLISHEDON to SOURCE_FILE; new loads fill it themselves). Written by
-- scripts/backfill-published-on.js on 2026-10-15 from each file's page or API: the date
-- the publisher states, and only if it is not after we downloaded the file
-- (a later date belongs to a newer version than ours). 239 of 521 files get
-- a date; the rest state none we can read, or only a newer version's (listed
-- at the end). Never guessed.
--
-- The loaders only add to SOURCE_FILE, so these updates run as ACCOUNTADMIN.
-- Each only touches rows that still have no date.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- achievement-app: 1 file, 2026-07-16
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-16'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('5acdf76d-348e-40e7-a9a9-f43e816cc034');

-- achievement-app: 1 file, 2025-11-27
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-11-27'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships/2024-25 (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('c58fe450-dc8f-4989-b097-93e73709ebe3');

-- achievement-et: 1 file, 2026-07-16
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-16'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/further-education-and-skills (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('04abe28c-1ff4-4e0a-92d1-779a5bb8b642');

-- destinations-16-18: 1 file, 2026-07-24
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-24'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/019d4e73-6440-7523-b60c-bfab1ad4a30d/versions/1.0.1 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('2d646d8a-8af3-4115-bcad-ffe69fe1e476');

-- ees-national-attainment: 1 file, 2026-04-23
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-04-23'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/019d9132-c369-7165-8288-207ef5e5e616/versions/1.0 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('91c04b99-d34a-4670-91e6-430b10e3f45b');

-- ees-national-retention: 1 file, 2026-04-23
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-04-23'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/019d9138-fa46-7320-a39a-07864bfca1b6/versions/1.0 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('0862a4ed-df69-445f-8008-e846ab6a3896');

-- graduate-outcomes: 1 file, 2023-10-19
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2023-10-19'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/8067a649-9929-43a1-931a-4e58ae04a3f8 (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('a1235bf0-b59e-4230-9fe0-d5e0e1d56c3b');

-- ks4-destinations: 1 file, 2026-07-24
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-24'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/019d4f41-22d1-71b2-a1a7-f3b91026815b/versions/1.0.1 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('9620e9c2-4567-4d9e-8776-939abf53ea5d');

-- ks4-performance-geography: 1 file, 2026-02-05
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-02-05'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/b3e19901-5d2b-b676-bb4c-e60937d74725/versions/1.0.1 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('54b37794-35d2-41dd-b27d-e18864d6be6c');

-- ks4-performance-school: 1 file, 2026-08-04
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-08-04'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/19e39901-a96c-be76-b9c2-6af54ae076d2/versions/1.0.3 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('77c3e3fd-8189-47cb-a296-d6e1cc109f86');

-- leo-fe-prv01, leo-fe-prv02, leo-fe-prv03, leo-fe-prv04, leo-fe-prv05, leo-fe-ear01, leo-fe-ear02: 7 files, 2025-12-18
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-12-18'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/further-education-outcome-based-success-measures (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('fa4187ca-027e-4bd0-9f00-b9a9d84cf8e4', '489b2685-3e83-4e26-b6e9-334a828e43ac', 'b802c9d1-8af6-4915-b530-21b5c50a7697', '8e0ee49f-df19-49bb-9d6b-ae1ae25affe7', 'eecf0d57-d00a-4f86-a98b-d70ba9e6aa08', '09f1fd7e-e22f-49b7-8c94-70ced6375fc2', 'dfa369f3-04ca-445e-aa5a-a11044683d15');

-- leo-grad-outcomes-earnings, leo-grad-cah3-subject, leo-grad-provider-regional-movement, leo-grad-provider-sex, leo-grad-provider-ethnicity, leo-grad-provider-ethnicity-by-subject, leo-grad-provider-idaci, leo-grad-provider-priorattainment, leo-grad-variable-lookup: 9 files, 2026-06-25
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-06-25'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/leo-graduate-and-postgraduate-outcomes (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('3027c439-f7ba-490a-be63-4b5704669bc7', '07edaf5b-c082-4e0d-9eb1-647c8a27270a', '4034d8e9-7c40-462a-a76c-74f8164912eb', 'adf86f07-a2b3-4cfe-8a7e-dbbe7aef350d', '6c8b381c-265b-4c96-aec3-1b94d7dd958b', '3a5c5076-bc37-441d-972a-4bf4499317c8', '33de4b35-9738-4f53-a859-f2713938c330', '5c35b44e-04bc-46ab-8da8-e222e9dee784', '02f9cee0-ecfc-4d42-85d1-93d74013d17f');

-- narts-2018-19: 47 files, 2020-05-04
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2020-05-04'::date, PUBLISHEDONFROM = 'https://www.gov.uk/api/content/government/statistics/national-achievement-rates-tables-2018-to-2019 public_updated_at'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('782af778-ee89-4a42-920e-3800edead2e3', 'b9a34268-8b4c-4374-bcd2-cf6e847d9fbd', '7ea41ce7-c9c7-465b-8a24-92da440a6d5d', '1ca90d35-dd6b-4a4c-9be9-7465fc0416bd', '195fc366-9541-4351-9510-9f006a1572a7', '29ba1554-bb9b-49ee-b905-e67473fc0dce', 'fbd051c2-0091-41ba-9fd2-a9419713d946', '1701bba2-32f4-47eb-ae2e-526e401799bb', '95d9f80d-df7d-4417-9486-b1343868c8ee', 'bbbb3865-bc4f-47af-ab6a-241f0d216b60', 'ded258d1-ecf1-4b89-832a-895bd092eda3', 'f073c74d-0119-4d57-b4cc-1aa54238ddc0', '7846aff2-b282-4a9d-a00b-a5c65c2a5a1e', 'a61c05e2-d07d-42eb-a8fd-8d32ac1677d4', '14a5559a-c6d3-4b3a-b469-ef79a3a0bbb0', '068e549a-59ce-4bd2-84c6-95763263258f', '917c84e9-1604-45a4-a5a6-5b5354333daf', '47e55d14-365e-455c-9c96-a6e63ea413f3', '2c3d4df5-8d88-4ea9-bc85-12cd14fb8bb3', '5e9abdff-2bda-4395-b029-2bc385332a35', '61b65d6b-2aac-43cf-b70b-e2d9a22362e4', 'f32c201a-605c-4a86-872a-42fd301a6aa0', 'ace11c63-9591-468f-a071-6fd10b17207b', '211bfc78-bd8f-4cce-a96d-97dae9a8a760', '391a1e7a-ad34-4dec-a594-8351fd4c78c7', '7248e59f-ea5f-447b-a206-0e3010da81db', '4d9128d1-6002-40cd-a3cf-46813416fc82', '0d4b8471-e2ba-42a0-a7ae-5adff3b7c557', '968cc876-e72a-4f55-8714-631a2f664778', 'cc3f9161-373d-4837-909f-03a42f5552d9', '9d325ab3-6f03-4c17-874a-8686a1eeffa4', '50e00442-6350-4f07-b0ef-711206583eed', '9e6e6e4f-98df-4be5-9d6c-5ff8e52818f1', '64ca7240-1248-4397-a10d-9895976f8440', '166ba75c-417a-4d8f-8c80-5282421b79b8', '308ee374-e340-4ee7-b55b-d994dc0d1c20', 'b122dfbc-f147-4392-a11a-78f72ccad911', 'e747f10f-6f92-4f2c-a3cf-f3ae613641a1', '56dfcb37-c2ec-4b55-8c9c-5c0f96b1e75e', '00ff73f6-19bd-4f42-af87-bb3f9eb49c83', '48d97a71-7710-40b3-b2f0-c7ac5c5bea6a', '2f7e1eb1-04ab-4f27-ac2b-5069e7a5e162', '04d1b418-7246-4ab8-8607-bffdada36fe8', '7169fc8c-97a1-4f03-a1fc-13b86de62962', 'e9dea8e3-f129-4a27-bae8-ef4c5a478ad0', '02c5fc44-19ed-4c37-ad72-4c355ab6b381', '3f1e74aa-e583-47f0-8832-3892327bd629');

-- ofsted-schools: 2 files, 2026-09-10
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-10'::date, PUBLISHEDONFROM = 'https://www.gov.uk/api/content/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes public_updated_at'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('123ac7dc-a548-4ac4-b1aa-b983789f0baa', '1e85c03d-84a0-42a7-9a1c-23366be75741');

-- performance-16-18: 1 file, 2026-04-23
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-04-23'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/a-level-and-other-16-to-18-results (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('f694926d-10e2-4701-a169-02b4f13b7dfc');

-- app-headline-full-year: 1 file, 2026-07-16
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-16'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/1d419801-a90e-f970-9335-a13623faccbe/versions/2.0.2 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('339ab797-fd8b-4227-b482-604d7a7858b6');

-- app-headline-in-year: 1 file, 2026-07-16
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-16'::date, PUBLISHEDONFROM = 'https://api.education.gov.uk/statistics/v1/data-sets/1d419801-435d-c676-b428-1217e08290c3/versions/2.0.2 published'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('97c200c6-6638-4ad1-aca2-49e42314d3a1');

-- app-underlying: 2 files, 2026-07-16
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-16'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('87be8cfa-281e-40c6-b77c-396e8d9e89df', '1a9647d6-57e2-48fc-820e-cbfc6beafda3');

-- app-underlying-2022-23: 2 files, 2024-11-28
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2024-11-28'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships-and-traineeships/2022-23 (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('bb0f3064-129d-4e4d-9ef6-d0d6ca4d0555', 'e8e89ba9-3495-415f-b197-4ca29c1a29bb');

-- ashe-occupation: 44 files, 2025-10-22
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-10-22'::date, PUBLISHEDONFROM = 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/occupation4digitsoc2010ashetable14/data description.releaseDate'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('6a759e8e-ed0e-4073-9685-e0cf3da19aa5', '1a7eabce-82ca-4247-adda-aa5377e746ad', 'e04eb166-6d19-4c14-b89a-23fa014c9bb0', 'c2fb5d9e-41b7-41b4-b78a-13ece6746a4d', '699f1710-721b-4ea3-8dad-d2bfd5bc7e17', '9f57b7dc-ac15-4590-9263-4c635a62e1ef', '051e2b30-52d0-4843-be13-703d3b3c1490', '21e1e9eb-d340-4cdb-9009-a6c9e12f493b', '0aafb75f-0da3-4ce5-bb48-1cf5aaec55c4', '56124849-f58a-43ff-9928-2d479dbb7c20', '47ff1ed3-90e0-42be-82ac-f698d7b445bf', '537f2939-9a37-4dde-bf5e-d0fe20e39b17', 'e88b94b3-d756-40f0-b708-0683901cfff2', '84f40bd5-346e-4b43-8b86-825ce5e53201', '8220d184-064d-434b-8580-e96c1451424d', '4c261a34-af4c-4767-aa54-a81ffac533fe', 'd74b69c8-c469-46c7-80dc-dace896488af', '9ad7b57a-2c6c-46c8-85bc-72143dc5a87c', '738962f8-dc1a-4897-9f91-405bcf5928ff', '13509bfc-5351-43b6-9b94-8f3d7d0315bb', 'e6cd5df8-a0cc-4dbb-b31b-04fa8b4e7107', 'a5176f3a-7b43-48b0-8fca-9ad1dc21b2f1', '922ce132-2e97-498d-bbdb-c13eaa690c60', '00c0b84c-50f6-4330-aef8-34e035d47f1d', '9b6bfa3c-9cc1-4716-9fa7-d5a0cbad2eb0', '21a2e7f0-008e-424e-9919-3b1080a8feb5', '54ef3743-6268-442e-b58a-790622ef9a66', '857b5521-0e57-4e9b-801a-66e6dd072af0', '5fbeec5f-4d23-407f-9d1b-7437e79967d4', '4e4ad14d-8feb-4d62-bda9-fcfc80f19663', '6428ad7a-f80b-4427-afea-7256818d9b63', '4a2e3a6b-f074-406b-bbb0-c399003b2ea0', '8377e8e4-3f59-4303-a490-43483a658c0d', '75e7971d-a4ee-4ec5-af10-7e1a352c567f', '44d3bd1e-8b55-48d9-8712-6985a8b0a279', '6d92857b-cc9c-468f-9135-8e4e5c9218cb', '4ae99b16-1dae-4204-8540-0a9aacd97d4a', 'b83246a9-4582-4f6c-a2fa-ade65f671ce0', 'b46259f2-7351-4378-abb8-c80e613017fa', 'be27d230-19b1-4fc4-9c5b-1a1be3d407ea', '1bb889ff-b4de-4459-b79c-a07744d24c03', 'ce253c5d-ad02-4a89-a4e4-0d839e228010', '6993fb2e-00b3-416e-9c83-8a0b6b5bf3a7', '866ff029-6c0d-4a1e-b984-2971b9c603b6');

-- ashe-occupation: 88 files, 2025-10-22
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-10-22'::date, PUBLISHEDONFROM = 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/regionbyoccupation4digitsoc2010ashetable15/data description.releaseDate'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('379ac462-6f80-49a7-b9a9-6955b6263f68', '5bb08c55-d1ac-48b3-bc73-9f22c63e8cc7', '433e42ad-147d-451d-b21a-82710d9c2960', '4331ff7f-1132-47a5-a05a-4f4c1ed841ee', '2415fe42-0032-4f5c-b1a4-2348775ef76c', 'be3ba544-a7ba-47f1-af37-0c95f52f8ae4', '27f1e481-a1f3-4063-8b87-fd6a259b3744', 'deb9f8d3-1d3e-447d-a475-d64e8ebafabf', '349c8edc-ccdd-4148-8ded-68d57272fb9d', 'c32b461c-c136-4cf6-bd16-b89574169ec7', '3eafd090-9660-435a-8fdd-7cc4098f5d27', 'a9b46f7c-6514-4d3b-b3e7-038ffbc37067', '6367a5f1-2877-44bb-8a15-3517cc7dc709', 'f32da0a9-d1a0-4ae7-8088-c36f02bcf3e7', 'a6b5a7e9-fbc2-496c-a4be-eeaf38d491f1', '58ffbe44-6a7a-4c92-ab8a-4c2dec9c95be', '6c385494-9bf6-4f53-828b-37762ba70896', 'b3fcce31-c7dc-457b-a1bb-78dd2f460b56', 'e3a34d92-03e1-4022-b75c-1654521475c2', '9199ebba-0c53-4281-babb-46052c11c94c', '7f16dfd7-d92e-479b-987d-2d3676f8bee3', '9f3f10df-7361-41f5-8a00-1e791de49278', '4b43c6e3-db5b-497b-ab42-689971133a39', '9be38f0b-a5e8-476e-93cf-56f3d4b04f97', 'a0290bd8-a4d5-4232-ab06-73add629297a', '0c442b41-b320-47ed-b78a-e983da142c35', 'fc1b6c61-48c3-4164-a8c2-d660221a0298', '3a85c798-93e6-4ecd-9a4f-e86513f8a636', '555ef77e-efd4-4b0c-9ead-55f2be038015', '0a18c74a-da31-4892-85ca-c70ee88c7b83', 'f579eb4f-5bc6-4e11-ad81-6b5a59843c25', '91fcfa11-a3ec-4afb-ace2-e56790d7d4d5', '244e13d8-9dd3-427c-947b-0a649d2f1b26', '181b6b2d-f3c8-43b4-bb16-a1d51e62420c', '2fee700d-df65-491f-9ccd-a309c52ae9c9', 'bec505a1-2421-45fe-8081-c2e4e778883e', 'bceacc84-8a7e-421a-8bd1-006b224ec5f9', '293328a6-446f-43be-b99d-815a018069fa', '873087fb-1262-4b77-95f2-c32ef5e7774f', '9a43bdce-c9c0-4888-a7c6-f290089d39d1', 'fbfb082e-907d-4071-a8d1-ca0d0223c338', 'ba6e509c-a5e6-486b-ad54-e887a66d938a', '0ec1f291-c26c-4bdc-bfe8-90aedae54b39', '29e72c29-1718-41e9-9870-f6379bc33141', '066531b8-6945-42d1-8cc9-0ff64e9b6af3', 'a3787242-0b05-43a7-bfce-a3d7f13c3b4b', '967984c9-24d2-4995-9d31-b81e9fc93ed9', 'be764354-1b85-4f4b-a2e0-400a8116252c', '911ad52a-24c6-4eb7-9f98-1b0d1dfd444c', '179517af-1a81-44b9-bd4a-151f6a3986e8', '2ffd33c4-3b54-4a1b-a1c9-625869c247d7', '46ed92c3-e56e-446d-9442-3081eacf06e8', '8e8b4165-38ce-4f69-a2d2-2dc18e2e8f91', '39a019d0-6db0-4876-ad58-731546ad8d9a', 'a0556778-99aa-46bf-8c8f-20c0d05616c9', '509567d9-a110-477e-addf-386ede91525f', 'bfbe12a8-a850-419f-b9ce-58df9564cab9', '9154b38c-6fcb-4dee-9593-80ff71002b3d', 'fb70d755-7d82-4cc5-be4a-b5c989f39597', 'd4667803-3c23-4723-a6d9-ba25bba40aed', '1263dd62-78d3-499a-8bf2-15464c8831ef', '271a20f1-a636-4270-aefa-6c4b0484d715', 'a441eb74-1c2b-4af1-b974-fed7ab781367', '125111c8-b7bd-4c62-920c-698cbca92ec2', '17472dba-1861-4f76-85cf-65ca6d9a89fb', 'ce619f88-0a50-4e6b-89ba-c417ae1f67f0', 'fb802cf4-89d5-4c26-88dc-b312b0c97962', '4535d6f3-bdf8-4cb5-bb39-54b28df00d56', 'ad953f27-6de3-4d4b-b060-0a960492469b', '3b5014b1-feef-4300-bd5f-d18fc646af3b', '13ba00c0-fb60-4115-856b-ceaf64cbbe0a', 'f5501d71-3abc-48e2-8aa2-fa6e8349703f', '18f28461-8055-423c-97bb-258487fb6d08', 'e0840c58-6a0e-4b20-a22b-e713ffb4b073', '16db8357-5a94-416b-9904-4ec766afe9d5', '7b154259-8794-4c89-bb78-2cb6d25e7905', '1a3050ca-db38-423e-8fe1-2ebca52842e6', '95c1f1e9-da3c-4c0c-a9fe-123f526649b4', 'bfdbc34d-add5-48b4-8679-d6f57d87c4b1', 'f3738372-f4ed-46af-865e-4008f7169ceb', '5257ba94-9c3a-4034-b884-6603f3e405f9', '1a323c85-6ad0-4f3a-8541-5f97fb5b9ed9', '9f1ef5a5-4b19-4527-a841-f6c477eca54d', '5be102fe-54ef-46bf-a7e7-b6b6aa0baa9d', '461609ff-ba55-47da-9591-ac560c153a32', 'efc8b5b8-cfb8-4553-b1be-ea8c309a2fad', '34d07cf3-c47a-4a40-bf92-ac2ac2feecb6', 'd2d66c09-efcf-44bd-9845-6f6af0e2d945');

-- employer-skills-survey: 6 files, 2025-07-24
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-07-24'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/employer-skills-survey (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('4a4ff6eb-4e21-4248-ba6a-2e29545f9d8e', '2fed446e-15a5-4469-a7c2-8bad38f50e29', '8ebe6eaa-b06c-4fb4-970b-d74f487d84cc', 'c0b63428-5af3-41cd-97fa-951686a185ee', '3ab6eac1-c40d-43e1-9443-e428afb56ec2', 'be04ba1a-92fa-46df-bbca-eec330f732bd');

-- iod-2025: 3 files, 2025-11-17
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-11-17'::date, PUBLISHEDONFROM = 'https://www.gov.uk/api/content/government/statistics/english-indices-of-deprivation-2025 public_updated_at'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('d05bbb1f-49e1-4798-9372-80fda31e22f9', 'd4332136-f500-4136-809f-c6cc950816ef', '8e0cd9f5-b775-4245-ad00-3ac9e5f7d29a');

-- neet-16-17: 3 files, 2026-07-02
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-02'::date, PUBLISHEDONFROM = 'https://explore-education-statistics.service.gov.uk/find-statistics/participation-in-education-training-and-neet-age-16-to-17-by-local-authority (the release''s published date on the page)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('9ec76253-3685-4f3b-8496-b8182e79caa6', '7f2086d7-9bfe-4152-b245-610d67990da5', '00943599-2a3a-4931-b4c8-f2541d3ff455');

-- nomis-ashe-resident: 1 file, 2025-11-03
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-11-03'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_30_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('425ac97f-a01f-4f75-888e-76414c7677ed');

-- nomis-ashe-workplace: 1 file, 2025-11-03
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-11-03'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_99_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('707d4d26-f3a4-4abe-ad67-415f8cbde748');

-- nomis-claimant-count: 1 file, 2026-09-15
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-15'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('aa809060-0dda-425a-bf15-ffd6b29e9811');

-- nomis-nm-141-1: 1 file, 2026-09-24
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-24'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_141_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('80228061-f2d6-46ef-863f-a19dd3627019');

-- nomis-nm-142-1: 1 file, 2026-09-24
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-24'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_142_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('f584508d-fa7a-4fa6-945e-14b136be7a9b');

-- nomis-nm-17-5: 1 file, 2026-07-21
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-07-21'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_17_5.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('6b55ac3c-1b19-496b-bc87-cba8019a34b5');

-- nomis-nm-189-1: 1 file, 2025-10-28
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-10-28'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_189_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('735e8223-7271-46ce-b3e9-80b335f66f1a');

-- nomis-nm-2014-1: 1 file, 2025-11-07
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-11-07'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2014_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('fd1baa99-5380-4b01-9741-db188a092b38');

-- nomis-nm-2077-1: 1 file, 2022-12-08
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2022-12-08'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2077_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('c9e28e8b-0303-47b9-8613-d3d597726587');

-- nomis-nm-2080-1: 1 file, 2022-12-08
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2022-12-08'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2080_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('ed14420e-86c3-4b31-9c52-32b80abca7ad');

-- nomis-nm-31-1: 1 file, 2025-07-30
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2025-07-30'::date, PUBLISHEDONFROM = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_31_1.def.sdmx.json LastUpdated (the data set''s last update)'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('af4c05c0-60d7-40f3-866d-b7b40dc41912');

-- ons-online-job-adverts: 1 file, 2026-09-24
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-24'::date, PUBLISHEDONFROM = 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourdemandvolumesbystandardoccupationclassificationsoc2020uk/data description.releaseDate'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('4f5f6cec-751c-47ac-b13f-d55778a2a65f');

-- ons-vacs02: 1 file, 2026-09-14
UPDATE SHARED_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-14'::date, PUBLISHEDONFROM = 'https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/datasets/vacanciesbyindustryvacs02/data description.releaseDate'
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN ('1ec6615b-1a95-4b2d-9b2a-6ee2e498acbb');

-- ---------------------------------------------------------------------------
-- Left empty (282 files), by source and why:
--   apar: download.apprenticeships.education.gov.uk states no publication date we can read (1)
--   discover-uni: www.hesa.ac.uk states no publication date we can read (27)
--   dwp-restart-scheme: a GOV.UK collection page states no date for its files (1)
--   dwp-work-and-health: a GOV.UK collection page states no date for its files (1)
--   fuel-poverty-sub-regional: a GOV.UK collection page states no date for its files (4)
--   gias: get-information-schools.service.gov.uk states no publication date we can read (1)
--   historic-england-listed: services-eu1.arcgis.com states no publication date we can read (1)
--   knowledge-bank: no page address (10)
--   lars: submit-learner-data.service.gov.uk states no publication date we can read (92)
--   naptan: naptan.api.dft.gov.uk states no publication date we can read (1)
--   neso-dno-areas: www.neso.energy states no publication date we can read (1)
--   nesta-skills-taxonomy: github.com states no publication date we can read (1)
--   ofgem-price-cap: www.ofgem.gov.uk states no publication date we can read (2)
--   ofqual-register: register-api.ofqual.gov.uk states no publication date we can read (2)
--   ofsted-fe-history: a GOV.UK collection page states no date for its files (31)
--   ofsted-fe: https://www.gov.uk/api/content/government/statistical-data-sets/inspections-and-outcomes-in-further-education-and-skills-management-information answers 404 (moved, removed, or no data release): no date to read (4)
--   ofsted-schools-history: a GOV.UK collection page states no date for its files (16)
--   onspd-lookups: geoportal.statistics.gov.uk states no publication date we can read (47)
--   onspd: geoportal.statistics.gov.uk states no publication date we can read (1)
--   page-data: no page address (5)
--   police-uk-outcomes: data.police.uk states no publication date we can read (1)
--   police-uk-street: data.police.uk states no publication date we can read (1)
--   skills-england-jobs-skills: github.com states no publication date we can read (6)
--   skills-england-lsip: github.com states no publication date we can read (11)
--   soc-coding-index: https://www.ons.gov.uk/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions/data answers 404 (moved, removed, or no data release): no date to read (6)
--   statxplore-uc-households: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-uc-people-by-conditionality: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-uc-people-by-employment: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-whp-first-earnings: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-whp-job-outcomes: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-whp-referrals: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   statxplore-whp-starts: stat-xplore.dwp.gov.uk states no publication date we can read (1)
--   wikidata-places: query.wikidata.org states no publication date we can read (1)

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- 1. Files with and without a publication date. Expected: SHARED_DB and
--    OPTIONS_DB, 239 dated between them; every PUBLISHEDON with its
--    PUBLISHEDONFROM.
SELECT 'SHARED_DB' AS DB_, COUNT(PUBLISHEDON) AS DATED, COUNT(*) - COUNT(PUBLISHEDON) AS NOT_DATED,
  COUNT_IF(PUBLISHEDON IS NOT NULL AND PUBLISHEDONFROM IS NULL) AS DATED_WITHOUT_FROM
FROM SHARED_DB.RAW.SOURCE_FILE
UNION ALL
SELECT 'OPTIONS_DB', COUNT(PUBLISHEDON), COUNT(*) - COUNT(PUBLISHEDON), COUNT_IF(PUBLISHEDON IS NOT NULL AND PUBLISHEDONFROM IS NULL)
FROM OPTIONS_DB.RAW.SOURCE_FILE;
