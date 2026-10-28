import {randomUUID} from 'node:crypto';
import {and,desc,eq,gt} from 'drizzle-orm';
import {SKINS} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,profiles,sessions,skinInventory,statistics,users,wallets} from './database/schema.js';
import {createSession} from './auth/service.js';
import type {WardrobeService} from './wardrobe.js';

const NAMES=['Zeca','Tião','Cida','Juca','Nando','Lúcia','Toninho','Marlene','Pedrão','Neide','Careca','Rosinha','Dudu','Valdir','Cleide',
  'Biro','Socorro','Tatá','Jurema','Gaúcho','Fafá','Mané','Kika','Nenê','Dalva','Baiano','Lelé','Vavá','Didi','Quinzinho'];
const COLORS=['#cf7549','#579a9b','#d4aa56','#ae884e','#8f6bb3','#5b8f4e','#c4566a','#4f7cc0','#b8a04a','#6f8d96'];
/** A bot spends on drinks, orders and the stage: below the floor its wallet is topped up to the full amount. */
const COINS={full:5000,floor:1000};

/**
 * Accounts for the development bots (tests/load/bots.ts), created on first use: verified, every skin owned (each bot
 * wears one, in turn), coins to spend and a session. Never registered in production (apps/api/src/app.ts).
 */
export class DevBots {
  constructor(private db:Database,private wardrobe:WardrobeService,private passwordHash:string){}

  async prepare(index:number):Promise<{userId:string;sessionId:string;displayName:string;color:string}>{
    const number=String(index).padStart(2,'0'),email=`bot-${number}@bots.bar.local`;
    const displayName=`Bot ${NAMES[(index-1)%NAMES.length]}${index>NAMES.length?` ${number}`:''}`,color=COLORS[(index-1)%COLORS.length]!;
    let [user]=await this.db.select().from(users).where(eq(users.email,email));
    if(!user){
      const id=randomUUID();
      await this.db.transaction(async tx=>{
        // The password is the API's unusable dummy hash: nobody logs in as a bot.
        await tx.insert(users).values({id,email,username:`bot_${number}`,verified:true,passwordHash:this.passwordHash});
        await tx.insert(profiles).values({userId:id,displayName,avatarConfig:{color},equippedSkin:SKINS[(index-1)%SKINS.length]!.id});
        for(const skin of SKINS)await tx.insert(skinInventory).values({userId:id,skinId:skin.id});
        await tx.insert(statistics).values({userId:id});
      });
      [user]=await this.db.select().from(users).where(eq(users.email,email));
    }
    const userId=user!.id;
    await this.wardrobe.initialize(userId);
    await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet||wallet.balance>=COINS.floor)return;
      await tx.insert(currencyLedger).values({id:`dev-bots:${randomUUID()}`,userId,amount:COINS.full-wallet.balance,reason:'dev-bots'});
      await tx.update(wallets).set({balance:COINS.full}).where(eq(wallets.userId,userId));
    });
    // One session per bot, reused while it has a day left: restarting the bots does not pile sessions up.
    const [session]=await this.db.select().from(sessions).where(and(eq(sessions.userId,userId),gt(sessions.expiresAt,new Date(Date.now()+86_400_000))))
      .orderBy(desc(sessions.expiresAt)).limit(1);
    const [profile]=await this.db.select().from(profiles).where(eq(profiles.userId,userId));
    const avatar=profile?.avatarConfig as {color?:string}|undefined;
    return {userId,sessionId:session?.id??(await createSession(this.db,userId)).session.id,displayName:profile?.displayName??displayName,color:avatar?.color??color};
  }
}
