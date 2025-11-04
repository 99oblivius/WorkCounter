--
-- PostgreSQL database dump
--

\restrict jwWbcIHKb2G0Z5eGKg4IK0yUFlLUfwtC7bWgiHkynUFCWqQ3ZUlcui7mTL8NfTt

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: workcounter
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO workcounter;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: file_storage; Type: TABLE; Schema: public; Owner: workcounter
--

CREATE TABLE public.file_storage (
    id integer NOT NULL,
    work_id integer NOT NULL,
    user_id integer NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100),
    file_extension character varying(20),
    storage_key character varying(500) NOT NULL,
    tus_id character varying(255),
    upload_status character varying(20) DEFAULT 'uploading'::character varying NOT NULL,
    upload_progress integer DEFAULT 0,
    uploaded_bytes bigint DEFAULT 0,
    error_message text,
    retry_count integer DEFAULT 0,
    uploaded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT file_size_check CHECK (((file_size > 0) AND (file_size <= '5368709120'::bigint))),
    CONSTRAINT file_upload_status_check CHECK (((upload_status)::text = ANY ((ARRAY['uploading'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT upload_progress_check CHECK (((upload_progress >= 0) AND (upload_progress <= 100)))
);


ALTER TABLE public.file_storage OWNER TO workcounter;

--
-- Name: file_storage_id_seq; Type: SEQUENCE; Schema: public; Owner: workcounter
--

CREATE SEQUENCE public.file_storage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_storage_id_seq OWNER TO workcounter;

--
-- Name: file_storage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: workcounter
--

ALTER SEQUENCE public.file_storage_id_seq OWNED BY public.file_storage.id;


--
-- Name: time_sessions; Type: TABLE; Schema: public; Owner: workcounter
--

CREATE TABLE public.time_sessions (
    id integer NOT NULL,
    work_id integer NOT NULL,
    user_id integer NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    duration_ms bigint,
    is_running boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.time_sessions OWNER TO workcounter;

--
-- Name: time_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: workcounter
--

CREATE SEQUENCE public.time_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.time_sessions_id_seq OWNER TO workcounter;

--
-- Name: time_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: workcounter
--

ALTER SEQUENCE public.time_sessions_id_seq OWNED BY public.time_sessions.id;


--
-- Name: timeline_entries; Type: TABLE; Schema: public; Owner: workcounter
--

CREATE TABLE public.timeline_entries (
    id integer NOT NULL,
    time_session_id integer NOT NULL,
    work_id integer NOT NULL,
    user_id integer NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    label text,
    activity_type text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    image_urls text[],
    CONSTRAINT timeline_entries_max_images_check CHECK (((image_urls IS NULL) OR (array_length(image_urls, 1) <= 9)))
);


ALTER TABLE public.timeline_entries OWNER TO workcounter;

--
-- Name: timeline_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: workcounter
--

CREATE SEQUENCE public.timeline_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.timeline_entries_id_seq OWNER TO workcounter;

--
-- Name: timeline_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: workcounter
--

ALTER SEQUENCE public.timeline_entries_id_seq OWNED BY public.timeline_entries.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: workcounter
--

CREATE TABLE public.users (
    id integer NOT NULL,
    authentik_id text NOT NULL,
    email text NOT NULL,
    username text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO workcounter;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: workcounter
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO workcounter;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: workcounter
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: works; Type: TABLE; Schema: public; Owner: workcounter
--

CREATE TABLE public.works (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text NOT NULL,
    description text,
    client_name text,
    hourly_rate numeric(10,2),
    status text DEFAULT 'active'::text,
    tags text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.works OWNER TO workcounter;

--
-- Name: works_id_seq; Type: SEQUENCE; Schema: public; Owner: workcounter
--

CREATE SEQUENCE public.works_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.works_id_seq OWNER TO workcounter;

--
-- Name: works_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: workcounter
--

ALTER SEQUENCE public.works_id_seq OWNED BY public.works.id;


--
-- Name: file_storage id; Type: DEFAULT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.file_storage ALTER COLUMN id SET DEFAULT nextval('public.file_storage_id_seq'::regclass);


--
-- Name: time_sessions id; Type: DEFAULT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.time_sessions ALTER COLUMN id SET DEFAULT nextval('public.time_sessions_id_seq'::regclass);


--
-- Name: timeline_entries id; Type: DEFAULT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.timeline_entries ALTER COLUMN id SET DEFAULT nextval('public.timeline_entries_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: works id; Type: DEFAULT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.works ALTER COLUMN id SET DEFAULT nextval('public.works_id_seq'::regclass);


--
-- Data for Name: file_storage; Type: TABLE DATA; Schema: public; Owner: workcounter
--

COPY public.file_storage (id, work_id, user_id, filename, original_name, display_name, file_size, mime_type, file_extension, storage_key, tus_id, upload_status, upload_progress, uploaded_bytes, error_message, retry_count, uploaded_at, created_at, updated_at) FROM stdin;
1	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1/files/1/1-Composition.blend	1/files/1/undefined-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 16:52:45.437672+00	2025-11-03 16:56:13.1243+00
2	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1/files/1/1762189191903-7680aca9ce2681b8-Composition.blend	1/files/1/1762189191901-e63d0716bd43a5d4-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 16:59:51.905037+00	2025-11-03 17:07:08.292402+00
3	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1/files/1/1762189638760-a124b35fa17764d7-Composition.blend	1/files/1/1762189638758-74349c9e287749ec-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:07:18.761557+00	2025-11-03 17:09:10.094183+00
4	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1/files/1/1762189753064-07a667ebf63bd3dd-Composition.blend	1/files/1/1762189753064-dd15e931188285b1-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:09:13.064955+00	2025-11-03 17:13:44.939182+00
6	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190042327-dcf73085a479b156-Composition.blend	1-1-1762190042324-0977a14caec242cc-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:14:02.330136+00	2025-11-03 17:14:15.864162+00
7	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190052570-b815570c8f9d7c9a-Composition.blend	1-1-1762190052568-7d8afd5bfda8d392-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:14:12.573135+00	2025-11-03 17:14:16.857483+00
5	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190037624-e7993fbd0618ecc4-Composition.blend	1-1-1762190037622-187ee021fc81c257-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:13:57.625476+00	2025-11-03 17:14:17.731583+00
8	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190062881-4771424e7c897462-Composition.blend	1-1-1762190062878-4b073557385cd228-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:14:22.88371+00	2025-11-03 17:18:20.099265+00
9	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190078180-869b9d9acfce3558-Composition.blend	1-1-1762190078177-dfd3d5520480954d-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:14:38.182876+00	2025-11-03 17:18:21.244587+00
10	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190322586-060c28919d16213d-Composition.blend	1-1-1762190322584-5be8b29efd2800ef-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:18:42.587734+00	2025-11-03 17:22:16.436583+00
11	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190327264-edbf97ae486fb18d-Composition.blend	1-1-1762190327260-9385e65326bdbb08-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:18:47.266735+00	2025-11-03 17:22:17.252138+00
12	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190337546-dd68bc1b01a182fd-Composition.blend	1-1-1762190337545-34337290f7c73204-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:18:57.546754+00	2025-11-03 17:22:17.713272+00
13	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190347698-c8daad1906b12e72-Composition.blend	1-1-1762190347698-d3b47064576cceb2-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:19:07.698998+00	2025-11-03 17:22:18.2545+00
14	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762190362907-0619cbd7aab501c9-Composition.blend	1-1-1762190362905-3e359abe5db075cc-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:19:22.908819+00	2025-11-03 17:22:18.710841+00
15	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191137033-4e33654f0e385739-Composition.blend	1-1-1762191137025-7096c3845f8abb18-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:32:17.033921+00	2025-11-03 17:34:55.980858+00
16	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191141634-a3e074b089ca7779-Composition.blend	1-1-1762191141632-a6b2ca73a5582878-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:32:21.635222+00	2025-11-03 17:34:56.522945+00
17	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191151803-9b3caf0ff7e52dd2-Composition.blend	1-1-1762191151797-d83c99fe5b086fcc-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:32:31.804426+00	2025-11-03 17:34:57.125387+00
18	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191161968-5fa8102644597fec-Composition.blend	1-1-1762191161957-1296afe070310786-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:32:41.970745+00	2025-11-03 17:34:57.61826+00
19	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191177214-aef4d82acbd194a3-Composition.blend	1-1-1762191177204-7ddeca53adea0dbd-Composition.blend	cancelled	0	0	\N	0	\N	2025-11-03 17:32:57.216489+00	2025-11-03 17:34:58.055734+00
20	1	1	Composition.blend	Composition.blend	Composition.blend	91984020	application/octet-stream	blend	1-1-1762191334998-ad9d80dd8cbe303a-Composition.blend	1-1-1762191334989-09dc5207df42d587-Composition.blend	completed	100	0	\N	0	2025-11-03 17:35:43.038536+00	2025-11-03 17:35:34.999957+00	2025-11-03 17:35:43.038536+00
\.


--
-- Data for Name: time_sessions; Type: TABLE DATA; Schema: public; Owner: workcounter
--

COPY public.time_sessions (id, work_id, user_id, start_time, end_time, duration_ms, is_running, created_at) FROM stdin;
2	1	1	2025-10-30 19:03:02.663	2025-10-30 19:38:43.622	2140959	f	2025-10-30 19:03:02.663658
3	1	1	2025-10-30 22:17:44.395	2025-10-30 23:12:41.254	3296859	f	2025-10-30 22:17:44.39535
4	1	1	2025-10-31 14:05:28.405	2025-10-31 16:12:45.9	7637495	f	2025-10-31 14:05:28.406925
5	1	1	2025-10-31 17:14:33.31	2025-10-31 20:10:57.389	10584079	f	2025-10-31 17:14:33.310966
10	1	1	2025-11-01 02:13:41.734	2025-11-01 03:30:03.623	4581889	f	2025-11-01 02:13:41.734555
17	1	1	2025-11-02 21:38:17.174	2025-11-02 23:50:34.294	7937120	f	2025-11-02 21:38:17.174699
18	1	1	2025-11-03 06:38:03.483	2025-11-03 08:16:02.283	5878800	f	2025-11-03 06:38:03.483846
\.


--
-- Data for Name: timeline_entries; Type: TABLE DATA; Schema: public; Owner: workcounter
--

COPY public.timeline_entries (id, time_session_id, work_id, user_id, "timestamp", label, activity_type, created_at, image_urls) FROM stdin;
1	2	1	1	2025-10-30 19:03:30.11	Installing Blender Plugin	Planning	2025-10-30 19:03:28.962473	\N
3	2	1	1	2025-10-30 19:13:24.377	Got 3D Tiles API key from google platforms	\N	2025-10-30 19:13:23.213403	\N
4	2	1	1	2025-10-30 19:18:14.112	Imported first building successfully	\N	2025-10-30 19:18:12.942385	\N
5	2	1	1	2025-10-30 19:38:43.245	Imported all 4 buildings	\N	2025-10-30 19:38:42.049392	\N
6	3	1	1	2025-10-30 22:22:24.031	first building mockup	\N	2025-10-30 22:22:23.904649	\N
8	3	1	1	2025-10-30 23:11:30.346	first building projection texturing first attempt	\N	2025-10-30 23:11:30.152399	\N
7	3	1	1	2025-10-30 23:02:37.763	first building geometry test 1	\N	2025-10-30 23:02:37.582706	\N
17	5	1	1	2025-10-31 19:51:28.31	catch-up with Claire	\N	2025-10-31 19:51:28.983513	{1/17/f070fa4f-6e6c-4d79-a3db-b961f14de7ca.webp,1/17/aa44de00-3cd0-4c4e-bf58-cdf6db377e37.webp}
2	2	1	1	2025-10-30 19:09:38.951	worked with 4.1.1	\N	2025-10-30 19:09:37.793046	\N
9	4	1	1	2025-10-31 14:36:24.648	UV mapped building for higher resolution texture mapping	\N	2025-10-31 14:36:23.422144	\N
10	4	1	1	2025-10-31 15:08:50.094	brainstorming texture and material improvements	\N	2025-10-31 15:08:51.170186	\N
11	4	1	1	2025-10-31 15:36:16.505	seperating materials with knife tool	\N	2025-10-31 15:36:17.539692	\N
12	4	1	1	2025-10-31 16:06:12.849	first building cleaned textures and uv	\N	2025-10-31 16:06:13.842046	\N
13	5	1	1	2025-10-31 17:36:43.396	seperated glass surfaces	\N	2025-10-31 17:36:44.267357	\N
14	5	1	1	2025-10-31 17:45:18.583	made new material for glass	\N	2025-10-31 17:45:19.438393	\N
15	5	1	1	2025-10-31 17:56:41.109	stretched UVs to hide broken edges	\N	2025-10-31 17:56:41.943443	\N
16	5	1	1	2025-10-31 18:15:06.265	got feedback regarding necessary mullions	\N	2025-10-31 18:15:07.073766	\N
18	5	1	1	2025-10-31 20:02:32.377	adding details to first building	\N	2025-10-31 20:02:33.035217	\N
19	10	1	1	2025-11-01 02:38:31.593	first building organic glass panes made	\N	2025-11-01 02:38:31.699364	\N
21	10	1	1	2025-11-01 03:20:07.798	named meshes and organized blender asset collection	\N	2025-11-01 03:20:07.841003	\N
22	10	1	1	2025-11-01 03:29:44.625	Sent and detailed current progress	\N	2025-11-01 03:29:44.649427	\N
20	10	1	1	2025-11-01 03:14:20.12	larger glass panes + expanded and optimized shades and lettering details	\N	2025-11-01 03:14:20.174496	{1/20/f4e56abd-fbfe-47ee-aee2-f29bf111fde9.webp}
35	17	1	1	2025-11-02 21:42:32.678	first building roof and title cleanup	\N	2025-11-02 21:42:31.314217	\N
36	17	1	1	2025-11-02 21:57:10.418	starting second building	\N	2025-11-02 21:57:09.037202	\N
37	17	1	1	2025-11-02 22:37:21.052	grey boxing done	\N	2025-11-02 22:37:19.613031	{1/37/0811d5ec-6609-4f26-842b-d369974c4bed.webp}
38	17	1	1	2025-11-02 23:50:27.708	trouble with grass texture baking and then succeeded. Tip; don't forget to apply scale	\N	2025-11-02 23:50:26.16776	{1/38/73d1b929-41c4-4339-95f5-886ded6caec3.webp}
39	18	1	1	2025-11-03 07:22:54.71	Added roof details	\N	2025-11-03 07:22:54.528665	{1/39/5f7d157f-7283-4e73-836c-58fa80178407.webp}
40	18	1	1	2025-11-03 08:09:45.865	skewed UVs for fixing seams + material improvements	\N	2025-11-03 08:09:45.616752	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: workcounter
--

COPY public.users (id, authentik_id, email, username, created_at, updated_at) FROM stdin;
1	b5d8ba7c6472f789f927d9c6a5a9243e3508b74002efd7ef0db8ceba5312c749	projects@oblivius.dev	projects@oblivius.dev	2025-10-30 18:18:00.453064	2025-10-30 18:18:00.453064
\.


--
-- Data for Name: works; Type: TABLE DATA; Schema: public; Owner: workcounter
--

COPY public.works (id, user_id, title, description, client_name, hourly_rate, status, tags, created_at, updated_at) FROM stdin;
1	1	Architectural Composition Blender Scene	\N	LDDBlueline	40.00	active	\N	2025-10-30 18:47:57.031957	2025-10-31 21:41:35.639777
\.


--
-- Name: file_storage_id_seq; Type: SEQUENCE SET; Schema: public; Owner: workcounter
--

SELECT pg_catalog.setval('public.file_storage_id_seq', 20, true);


--
-- Name: time_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: workcounter
--

SELECT pg_catalog.setval('public.time_sessions_id_seq', 18, true);


--
-- Name: timeline_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: workcounter
--

SELECT pg_catalog.setval('public.timeline_entries_id_seq', 40, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: workcounter
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: works_id_seq; Type: SEQUENCE SET; Schema: public; Owner: workcounter
--

SELECT pg_catalog.setval('public.works_id_seq', 1, true);


--
-- Name: file_storage file_storage_pkey; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.file_storage
    ADD CONSTRAINT file_storage_pkey PRIMARY KEY (id);


--
-- Name: file_storage file_storage_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.file_storage
    ADD CONSTRAINT file_storage_storage_key_key UNIQUE (storage_key);


--
-- Name: time_sessions time_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_pkey PRIMARY KEY (id);


--
-- Name: timeline_entries timeline_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_pkey PRIMARY KEY (id);


--
-- Name: users users_authentik_id_key; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_authentik_id_key UNIQUE (authentik_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: works works_pkey; Type: CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_pkey PRIMARY KEY (id);


--
-- Name: idx_file_storage_display_name; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_file_storage_display_name ON public.file_storage USING gin (to_tsvector('english'::regconfig, (display_name)::text));


--
-- Name: idx_file_storage_status; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_file_storage_status ON public.file_storage USING btree (upload_status);


--
-- Name: idx_file_storage_uploaded_at; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_file_storage_uploaded_at ON public.file_storage USING btree (uploaded_at DESC);


--
-- Name: idx_file_storage_user_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_file_storage_user_id ON public.file_storage USING btree (user_id);


--
-- Name: idx_file_storage_work_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_file_storage_work_id ON public.file_storage USING btree (work_id);


--
-- Name: idx_time_sessions_is_running; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_time_sessions_is_running ON public.time_sessions USING btree (is_running);


--
-- Name: idx_time_sessions_user_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_time_sessions_user_id ON public.time_sessions USING btree (user_id);


--
-- Name: idx_time_sessions_work_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_time_sessions_work_id ON public.time_sessions USING btree (work_id);


--
-- Name: idx_timeline_entries_has_images; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_timeline_entries_has_images ON public.timeline_entries USING btree (id) WHERE ((image_urls IS NOT NULL) AND (array_length(image_urls, 1) > 0));


--
-- Name: idx_timeline_entries_session_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_timeline_entries_session_id ON public.timeline_entries USING btree (time_session_id);


--
-- Name: idx_timeline_entries_user_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_timeline_entries_user_id ON public.timeline_entries USING btree (user_id);


--
-- Name: idx_timeline_entries_work_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_timeline_entries_work_id ON public.timeline_entries USING btree (work_id);


--
-- Name: idx_users_authentik_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_users_authentik_id ON public.users USING btree (authentik_id);


--
-- Name: idx_works_status; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_works_status ON public.works USING btree (status);


--
-- Name: idx_works_user_id; Type: INDEX; Schema: public; Owner: workcounter
--

CREATE INDEX idx_works_user_id ON public.works USING btree (user_id);


--
-- Name: file_storage update_file_storage_updated_at; Type: TRIGGER; Schema: public; Owner: workcounter
--

CREATE TRIGGER update_file_storage_updated_at BEFORE UPDATE ON public.file_storage FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: workcounter
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: works update_works_updated_at; Type: TRIGGER; Schema: public; Owner: workcounter
--

CREATE TRIGGER update_works_updated_at BEFORE UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: file_storage file_storage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.file_storage
    ADD CONSTRAINT file_storage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: file_storage file_storage_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.file_storage
    ADD CONSTRAINT file_storage_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: time_sessions time_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: time_sessions time_sessions_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.time_sessions
    ADD CONSTRAINT time_sessions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: timeline_entries timeline_entries_time_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_time_session_id_fkey FOREIGN KEY (time_session_id) REFERENCES public.time_sessions(id) ON DELETE CASCADE;


--
-- Name: timeline_entries timeline_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: timeline_entries timeline_entries_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: works works_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: workcounter
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict jwWbcIHKb2G0Z5eGKg4IK0yUFlLUfwtC7bWgiHkynUFCWqQ3ZUlcui7mTL8NfTt

