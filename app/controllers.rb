require 'json'

Beamit::App.controllers '/presentations/:slug' do

  before do
    @presentation = params[:slug].gsub('-', '_')
    @settings = settings.send(@presentation)
  end

  get :index do
    render 'slides'
  end

  get :presenter do
    render 'slides', layout: 'presenter'
  end

  get :print do
    render 'slides', layout: 'print'
  end

  get :remote do
    render 'slides', layout: 'remote'
  end

  get :socket do
    if request.websocket?
      request.websocket do |ws|
        ws.onopen do
          register_slave(ws, @presentation)
        end
        ws.onmessage do |msg|
          hash = JSON.parse(msg)
          if hash['event'] == 'registerPresenter' && hash['presenterToken'] == @settings[:presenter_token]
            register_presenter(ws, @presentation)
          elsif ws == presenter(@presentation) && hash['presenterToken'] == @settings[:presenter_token]
            broadcast_slaves(msg, @presentation)
          elsif presenter(@presentation)
            send_presenter(msg, @presentation)
          end
        end
        ws.onclose do
          if ws == presenter(@presentation)
            unregister_presenter(@presentation)
          else
            unregister_slave(ws, @presentation)
          end
        end
      end
    end
  end
end
