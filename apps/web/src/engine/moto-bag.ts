import * as pc from 'playcanvas';

/** moto_v3/moto_bag.js, kept as a separate item with the original public script API. */
export class MotoBag extends pc.Script {
  static scriptName='motoBag';
  aberta=false;
  anguloAbertura=105;
  suavizacao=8;
  private tampa?:pc.Entity;
  private repouso=new pc.Quat();
  private abertura=0;
  private readonly q=new pc.Quat();
  private readonly r=new pc.Quat();
  initialize():void {
    this.tampa=this.entity.findByName('bag_tampa') as pc.Entity;
    if(this.tampa)this.repouso.copy(this.tampa.getLocalRotation());
    else console.warn('motoBag: osso "bag_tampa" nao encontrado');
  }
  update(dt:number):void {
    if(!this.tampa)return;
    this.abertura+=((this.aberta?1:0)-this.abertura)*(1-Math.exp(-this.suavizacao*dt));
    this.q.setFromEulerAngles(-this.anguloAbertura*this.abertura,0,0);
    this.tampa.setLocalRotation(this.r.mul2(this.repouso,this.q));
  }
}
