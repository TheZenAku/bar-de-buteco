import {MigrationError,type SqlExecutor} from './migrations.js';

type ColumnSpec=readonly [type:string,nullable?:boolean,defaultFragment?:string];
const columns:Record<string,Record<string,ColumnSpec>>={
  bar_schema_migrations:{name:['text'],checksum:['text'],applied_at:['timestamp with time zone',false,'now()']},
  users:{id:['text'],username:['text'],email:['text'],password_hash:['text'],role:['text',false,"'player'::text"],verified:['boolean',false,'false'],created_at:['timestamp with time zone',false,'now()']},
  user_profiles:{user_id:['text'],display_name:['text'],avatar_config:['jsonb',false,'#cf7549'],equipped_skin:['text',false,"'nathan'::text"],status_message:['text',false,"''::text"],skill_loadouts:['jsonb',false,"'{}'::jsonb"]},
  sessions:{id:['text'],user_id:['text'],token_hash:['text'],expires_at:['timestamp with time zone'],created_at:['timestamp with time zone',false,'now()']},
  email_verifications:{token_hash:['text'],user_id:['text'],expires_at:['timestamp with time zone']},
  password_resets:{token_hash:['text'],user_id:['text'],expires_at:['timestamp with time zone']},
  blocks:{user_id:['text'],blocked_id:['text']},
  reports:{id:['text'],reporter_id:['text'],user_id:['text'],reason:['text'],created_at:['timestamp with time zone',false,'now()'],resolved_at:['timestamp with time zone',true],resolved_by:['text',true],resolution:['text',true]},
  moderation_actions:{id:['text'],actor_id:['text'],user_id:['text',true],action:['text'],reason:['text'],expires_at:['timestamp with time zone',true],revoked_at:['timestamp with time zone',true],created_at:['timestamp with time zone',false,'now()']},
  game_statistics:{user_id:['text'],blackjack_wins:['integer',false,'0'],blackjack_losses:['integer',false,'0'],blackjack_draws:['integer',false,'0'],games_played:['integer',false,'0']},
  game_results:{id:['text'],user_id:['text'],result:['text'],created_at:['timestamp with time zone',false,'now()']},
  game_controls:{id:['text'],payload:['jsonb'],created_at:['timestamp with time zone',false,'now()'],acknowledged:['boolean',false,'false'],status:['text',false,"'pending'::text"],lease_owner:['text',true],lease_expires_at:['timestamp with time zone',true],attempts:['integer',false,'0'],applied_at:['timestamp with time zone',true],last_error:['text',true]},
  wallets:{user_id:['text'],balance:['integer',false,'0']},
  fuel_services:{id:['text'],user_id:['text'],budget:['integer'],total:['integer',false,'0'],settled:['boolean',false,'false']},
  skin_inventory:{user_id:['text'],skin_id:['text'],acquired_at:['timestamp with time zone',false,'now()']},
  skill_inventory:{user_id:['text'],skill_id:['text'],acquired_at:['timestamp with time zone',false,'now()']},
  skin_catalog:{key:['text'],rarity:['text'],description:['text'],availability:['text',false,"'sale'::text"],updated_at:['timestamp with time zone',false,'now()'],updated_by:['text',true]},
  currency_ledger:{id:['text'],user_id:['text'],amount:['integer'],reason:['text'],created_at:['timestamp with time zone',false,'now()']},
  item_inventory:{user_id:['text'],item_id:['text'],quantity:['integer'],updated_at:['timestamp with time zone',false,'now()']},
  inventory_ledger:{id:['text'],user_id:['text'],item_id:['text'],quantity:['integer'],reason:['text'],created_at:['timestamp with time zone',false,'now()']},
  phone_lines:{user_id:['text'],number:['text'],created_at:['timestamp with time zone',false,'now()']},
  phone_contacts:{owner_id:['text'],contact_id:['text'],created_at:['timestamp with time zone',false,'now()']},
  phone_messages:{id:['text'],sender_id:['text'],recipient_id:['text'],body:['text'],created_at:['timestamp with time zone',false,'now()'],read_at:['timestamp with time zone',true],media_id:['text',true],media_kind:['text',true],media_ms:['integer',true],location:['jsonb',true]},
  gram_posts:{id:['text'],author_id:['text'],caption:['text',false,"''::text"],image:['text'],created_at:['timestamp with time zone',false,'now()']},
  gram_likes:{post_id:['text'],user_id:['text'],created_at:['timestamp with time zone',false,'now()']},
  gram_comments:{id:['text'],post_id:['text'],author_id:['text'],body:['text'],created_at:['timestamp with time zone',false,'now()']},
  gram_profiles:{user_id:['text'],handle:['text'],name:['text'],bio:['text',false,"''::text"],photo:['text',true],photo_at:['timestamp with time zone',true],updated_at:['timestamp with time zone',false,'now()']},
  badges:{id:['text'],name:['text'],description:['text'],icon:['text'],color:['text'],rarity:['text',false,"'common'::text"],image_id:['text',true],created_at:['timestamp with time zone',false,'now()']},
  badge_images:{id:['text'],bytes:['bytea'],size:['integer'],created_at:['timestamp with time zone',false,'now()']},
  user_badges:{user_id:['text'],badge_id:['text'],shown_at:['smallint',true],granted_at:['timestamp with time zone',false,'now()'],notified_at:['timestamp with time zone',true]},
  user_achievements:{user_id:['text'],series:['text'],value:['integer',false,'0'],updated_at:['timestamp with time zone',false,'now()']},
  trades:{id:['text'],user_a:['text'],user_b:['text'],offer_a:['jsonb'],offer_b:['jsonb'],fingerprint:['text'],created_at:['timestamp with time zone',false,'now()']},
  player_vehicles:{id:['text'],plate:['text'],user_id:['text'],model:['text'],parts:['text'],mileage:['integer',false,'0'],color:['text',false,"'#ccc9c2'"],fuel:['double precision',false,'100'],bought_at:['timestamp with time zone',false,'now()'],updated_at:['timestamp with time zone',false,'now()']},
  highfood_customers:{id:['text'],name:['text'],skin:['text'],look:['jsonb'],image_id:['text',true],lines:['jsonb'],active:['boolean',false,'true'],updated_at:['timestamp with time zone',false,'now()']},
  highfood_deliveries:{id:['text'],user_id:['text'],customer_id:['text'],customer:['text'],restaurant:['text'],items:['jsonb'],address:['text'],length_m:['integer'],duration_ms:['integer'],paid:['integer',false,'0'],stars:['smallint',true],on_time:['boolean',false,'false'],crashes:['smallint',false,'0'],status:['text'],created_at:['timestamp with time zone',false,'now()']},
  gram_follows:{follower_id:['text'],followed_id:['text'],created_at:['timestamp with time zone',false,'now()']},
  phone_media:{id:['text'],owner_id:['text'],kind:['text'],mime:['text'],bytes:['bytea'],size:['integer'],duration_ms:['integer',true],created_at:['timestamp with time zone',false,'now()']},
  economy_prices:{key:['text'],value:['integer'],updated_by:['text',true],updated_at:['timestamp with time zone',false,'now()']},
  game_logs:{id:['text'],source:['text'],event:['text'],user_id:['text',true],details:['jsonb',false,"'{}'::jsonb"],created_at:['timestamp with time zone',false,'now()']},
};

const primaryKeys:Record<string,string>={
  bar_schema_migrations:'name',
  users:'id',user_profiles:'user_id',sessions:'id',email_verifications:'token_hash',password_resets:'token_hash',fuel_services:'id',
  blocks:'user_id,blocked_id',reports:'id',moderation_actions:'id',game_statistics:'user_id',game_results:'id',
  game_controls:'id',wallets:'user_id',skin_inventory:'user_id,skin_id',skill_inventory:'user_id,skill_id',skin_catalog:'key',currency_ledger:'id',item_inventory:'user_id,item_id',inventory_ledger:'id',
  phone_lines:'user_id',phone_contacts:'owner_id,contact_id',phone_messages:'id',gram_posts:'id',gram_likes:'post_id,user_id',gram_comments:'id',
  gram_profiles:'user_id',gram_follows:'follower_id,followed_id',phone_media:'id',economy_prices:'key',game_logs:'id',badges:'id',user_badges:'user_id,badge_id',badge_images:'id',user_achievements:'user_id,series',player_vehicles:'id',trades:'id',highfood_customers:'id',highfood_deliveries:'id',
};

const foreignKeys:Array<readonly [table:string,column:string,cascade:boolean]>=[
  ['user_profiles','user_id',true],['sessions','user_id',true],['email_verifications','user_id',true],['password_resets','user_id',true],
  ['blocks','user_id',true],['blocks','blocked_id',true],['reports','reporter_id',false],['reports','user_id',false],
  ['moderation_actions','actor_id',false],['moderation_actions','user_id',false],['game_statistics','user_id',true],['game_results','user_id',false],
  ['wallets','user_id',true],['skin_inventory','user_id',true],['skill_inventory','user_id',true],['skin_catalog','updated_by',false],['currency_ledger','user_id',true],['item_inventory','user_id',true],['inventory_ledger','user_id',true],
  ['phone_lines','user_id',true],['phone_contacts','owner_id',true],['phone_contacts','contact_id',true],['phone_messages','sender_id',true],['phone_messages','recipient_id',true],
  ['gram_posts','author_id',true],['gram_likes','user_id',true],['gram_comments','author_id',true],
  ['gram_profiles','user_id',true],['gram_follows','follower_id',true],['gram_follows','followed_id',true],['phone_media','owner_id',true],
  ['reports','resolved_by',false],['economy_prices','updated_by',false],['user_badges','user_id',true],['user_achievements','user_id',true],['player_vehicles','user_id',true],['highfood_deliveries','user_id',true],
];

const uniqueConstraints:Array<readonly [table:string,column:string]>=[['users','username'],['users','email'],['sessions','token_hash'],['phone_lines','number'],['gram_profiles','handle'],['player_vehicles','plate']];
const checkConstraints:Array<readonly [table:string,fragments:string[]]>=[
  ['bar_schema_migrations',['length(checksum)=64']],['skin_catalog',['availability','sale','closed','hidden']],['skin_catalog',['rarity','legendary']],['user_achievements',['value>=0']],['player_vehicles',['mileage>=0']],['trades',['user_a<>user_b']],['highfood_deliveries',['paid>=0']],['highfood_deliveries',['status','delivered','gave-up']],
  ['users',['role','player','admin']],['blocks',['user_id<>blocked_id']],['wallets',['balance>=0']],
  ['item_inventory',['quantity>0']],['inventory_ledger',['quantity<>0']],
  ['phone_contacts',['owner_id<>contact_id']],['phone_messages',['sender_id<>recipient_id']],['phone_lines',['number']],
  ['gram_follows',['follower_id<>followed_id']],['gram_profiles',['handle']],['economy_prices',['value>=0']],['game_logs',['source','api','world']],['phone_media',['kind','photo','audio','video']],['phone_messages',['media_kind','length(body)']],['badge_images',['length(id)=64']],['badges',['rarity','common','legendary']],
];
const indexes:Record<string,string[]>={
  player_vehicles_owner_idx:['player_vehicles','user_id,bought_at'],trades_user_a_idx:['trades','user_a,created_atdesc'],trades_user_b_idx:['trades','user_b,created_atdesc'],highfood_deliveries_user_idx:['highfood_deliveries','user_id,created_at'],sessions_user_idx:['sessions','user_id'],user_badges_unnotified_idx:['user_badges','user_id','notified_atisnull'],moderation_user_idx:['moderation_actions','user_id,action'],
  currency_ledger_user_idx:['currency_ledger','user_id,created_at'],inventory_ledger_user_idx:['inventory_ledger','user_id,created_atdesc'],
  game_controls_status_created_idx:['game_controls','status,created_at'],
  phone_messages_pair_idx:['phone_messages','sender_id,recipient_id,created_atdesc'],phone_messages_unread_idx:['phone_messages','recipient_id,read_at'],
  gram_posts_created_idx:['gram_posts','created_atdesc'],gram_posts_author_idx:['gram_posts','author_id,created_atdesc'],gram_comments_post_idx:['gram_comments','post_id,created_at'],
  gram_follows_followed_idx:['gram_follows','followed_id,created_atdesc'],phone_media_owner_idx:['phone_media','owner_id,created_at'],
  game_logs_created_idx:['game_logs','created_atdesc'],game_logs_user_idx:['game_logs','user_id,created_atdesc'],currency_ledger_created_idx:['currency_ledger','created_atdesc'],currency_ledger_reason_idx:['currency_ledger','reason'],
  inventory_ledger_created_idx:['inventory_ledger','created_atdesc'],moderation_created_idx:['moderation_actions','created_atdesc'],reports_created_idx:['reports','created_atdesc'],
};

const compact=(value:string)=>value.toLowerCase().replace(/["\s()]/g,'');
const requireFragments=(value:string,fragments:string[])=>fragments.every(fragment=>compact(value).includes(compact(fragment)));

interface ColumnRow extends Record<string,unknown>{table_name:string;column_name:string;data_type:string;is_nullable:'YES'|'NO';column_default:string|null}
interface ConstraintRow extends Record<string,unknown>{table_name:string;contype:string;definition:string}
interface IndexRow extends Record<string,unknown>{tablename:string;indexname:string;indexdef:string}

/** Certifies legacy baselines and detects drift that IF NOT EXISTS would otherwise hide. Extra expand-only fields are allowed. */
export async function verifyApplicationSchema(executor:SqlExecutor):Promise<void>{
  const foundColumns=await executor.query<ColumnRow>("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'");
  const byColumn=new Map(foundColumns.map(row=>[`${row.table_name}.${row.column_name}`,row]));
  for(const [table,tableColumns] of Object.entries(columns))for(const [column,[type,nullable=false,defaultFragment]] of Object.entries(tableColumns)){
    const row=byColumn.get(`${table}.${column}`);
    if(!row)throw new MigrationError(`Schema incompatível: coluna ausente ${table}.${column}.`);
    if(row.data_type!==type||row.is_nullable!==(nullable?'YES':'NO'))
      throw new MigrationError(`Schema incompatível: definição inesperada de ${table}.${column}.`);
    if(defaultFragment===undefined?row.column_default!==null:!row.column_default||!compact(row.column_default).includes(compact(defaultFragment)))
      throw new MigrationError(`Schema incompatível: default inesperado de ${table}.${column}.`);
  }

  const constraints=await executor.query<ConstraintRow>("SELECT c.relname AS table_name, x.contype, pg_get_constraintdef(x.oid) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
  const hasConstraint=(table:string,type:string,fragments:string[])=>constraints.some(row=>row.table_name===table&&row.contype===type&&requireFragments(row.definition,fragments));
  for(const [table,key] of Object.entries(primaryKeys))if(!hasConstraint(table,'p',[`PRIMARY KEY (${key})`]))
    throw new MigrationError(`Schema incompatível: chave primária ausente ou divergente em ${table}.`);
  for(const [table,column] of uniqueConstraints)if(!hasConstraint(table,'u',[`UNIQUE (${column})`]))
    throw new MigrationError(`Schema incompatível: UNIQUE ausente em ${table}.${column}.`);
  for(const [table,column,cascade] of foreignKeys){
    const fragments=[`FOREIGN KEY (${column})`,'REFERENCES users(id)',...(cascade?['ON DELETE CASCADE']:[])];
    const found=constraints.some(row=>{
      if(row.table_name!==table||row.contype!=='f'||!requireFragments(row.definition,fragments))return false;
      if(cascade)return true;
      // These relationships intentionally use PostgreSQL's default NO ACTION semantics.
      // Explicit NO ACTION is equivalent; every other delete action changes the contract.
      return !/ondelete(cascade|setnull|setdefault|restrict)/.test(compact(row.definition));
    });
    if(!found)throw new MigrationError(`Schema incompatível: chave estrangeira ausente ou divergente em ${table}.${column}.`);
  }
  for(const [table,fragments] of checkConstraints)if(!hasConstraint(table,'c',fragments))
    throw new MigrationError(`Schema incompatível: CHECK obrigatório ausente em ${table}.`);

  const foundIndexes=await executor.query<IndexRow>("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'");
  const byIndex=new Map(foundIndexes.map(row=>[row.indexname,row]));
  for(const [name,[table,...fragments]] of Object.entries(indexes)){
    const row=byIndex.get(name);
    if(!row||row.tablename!==table||!requireFragments(row.indexdef,fragments))throw new MigrationError(`Schema incompatível: índice ausente ou divergente ${name}.`);
  }
}
