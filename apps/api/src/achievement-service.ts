import {and,eq,inArray,isNull,sql} from 'drizzle-orm';
import {ACHIEVEMENT_SERIES,achievementBadgeId,achievementSeries,crossedLevels,type AchievementEvent,type AchievementView,type Badge} from '@bar/shared';
import type {Database} from './database/index.js';
import {badges,userAchievements,userBadges,users} from './database/schema.js';

const badgeColumns={id:badges.id,name:badges.name,description:badges.description,icon:badges.icon,color:badges.color,rarity:badges.rarity,image:badges.image};

/** What players earn by playing (docs/sistemas/conquistas.md): a counter per player and series, whose goals give badges. */
export class AchievementService {
  constructor(private db:Database){}

  /** Adds to the counters and gives the badges of the goals they pass. A series or a player that does not exist counts for nothing. */
  async add(events:readonly AchievementEvent[]):Promise<void>{
    const totals=new Map<string,AchievementEvent>();
    for(const event of events){
      if(!achievementSeries(event.series)||event.amount<=0)continue;
      const key=`${event.userId}\n${event.series}`,total=totals.get(key);
      if(total)total.amount+=event.amount;else totals.set(key,{...event});
    }
    if(!totals.size)return;
    await this.db.transaction(async tx=>{
      const ids=[...new Set([...totals.values()].map(event=>event.userId))];
      const people=new Set((await tx.select({id:users.id}).from(users).where(inArray(users.id,ids))).map(row=>row.id));
      for(const {userId,series,amount} of totals.values()){
        if(!people.has(userId))continue;
        const [row]=await tx.insert(userAchievements).values({userId,series,value:amount})
          .onConflictDoUpdate({target:[userAchievements.userId,userAchievements.series],set:{value:sql`${userAchievements.value}+${amount}`,updatedAt:new Date()}}).returning({value:userAchievements.value});
        const earned=crossedLevels(achievementSeries(series)!,row!.value-amount,row!.value).map(level=>achievementBadgeId(series,level));
        if(!earned.length)continue;
        // A badge the administration deleted is simply not given.
        const existing=await tx.select({id:badges.id}).from(badges).where(inArray(badges.id,earned));
        if(existing.length)await tx.insert(userBadges).values(existing.map(({id})=>({userId,badgeId:id}))).onConflictDoNothing();
      }
    });
  }
  /** The badges these players got and were not told about yet, from any source (a goal, the phone, the administration). Told once. */
  async unlocked(userIds:readonly string[]):Promise<Array<{userId:string;badge:Badge}>>{
    if(!userIds.length)return [];
    const told=await this.db.update(userBadges).set({notifiedAt:new Date()}).where(and(inArray(userBadges.userId,[...userIds]),isNull(userBadges.notifiedAt))).returning({userId:userBadges.userId,badgeId:userBadges.badgeId});
    if(!told.length)return [];
    const catalog=new Map((await this.db.select(badgeColumns).from(badges).where(inArray(badges.id,told.map(row=>row.badgeId)))).map(badge=>[badge.id,badge]));
    return told.flatMap(({userId,badgeId})=>{const badge=catalog.get(badgeId);return badge?[{userId,badge}]:[];});
  }
  /** Every series with where this player stands in it. */
  async view(userId:string):Promise<AchievementView[]>{
    const [counters,catalog,owned]=await Promise.all([
      this.db.select({series:userAchievements.series,value:userAchievements.value}).from(userAchievements).where(eq(userAchievements.userId,userId)),
      this.db.select(badgeColumns).from(badges),
      this.db.select({id:userBadges.badgeId}).from(userBadges).where(eq(userBadges.userId,userId)),
    ]);
    const values=new Map(counters.map(row=>[row.series,row.value])),byId=new Map(catalog.map(badge=>[badge.id,badge])),mine=new Set(owned.map(row=>row.id));
    return ACHIEVEMENT_SERIES.flatMap(series=>{
      const tiers=series.goals.flatMap((goal,level)=>{
        const id=achievementBadgeId(series.id,level),badge=byId.get(id);
        return badge?[{goal,badge,owned:mine.has(id)}]:[];
      });
      return tiers.length?[{id:series.id,name:series.name,unit:series.unit,value:Math.floor((values.get(series.id)??0)/(series.per??1)),tiers}]:[];
    });
  }
}
